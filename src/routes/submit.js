'use strict';

/**
 * POST /api/submit
 *
 * Pipeline:
 *   1. Multer saves photos to uploads/{randomFolderId}/
 *   2. Validate all fields
 *   3. Generate Onboarding ID (using real registration from body)
 *   4. Save record to JSON store
 *   5. Generate PDF certificate
 *   6. Send confirmation email (PDF + photos attached)
 *   7. Return success JSON
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const { validateSubmission } = require('../middleware/validate');
const { generateCertificate } = require('../services/pdfService');
const { sendConfirmation }    = require('../services/emailService');
const { lookupVehicle }       = require('../services/vehicleLookup');
const { runOcr }              = require('../services/ocrService');
const db = require('../db');

const router = express.Router();

// ── Uploads root ──────────────────────────────────────────────────────────────
const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '..', '..', 'uploads');

fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

// ── Allowed MIME types ────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);

// ── Multer — each request gets its own folder keyed to a random ID ────────────
function makeUpload(folderPath) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(folderPath, { recursive: true });
      cb(null, folderPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${file.fieldname}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_MIME.has(file.mimetype.toLowerCase())) cb(null, true);
      else cb(new Error(`${file.mimetype} is not allowed. Use JPG, PNG, or HEIC.`));
    },
  }).fields([
    { name: 'system_photo',       maxCount: 1 },
    { name: 'network_photo',      maxCount: 1 },
    { name: 'server_photo',       maxCount: 1 },
    { name: 'registration_photo', maxCount: 1 },
    { name: 'vin_photo',          maxCount: 1 },
  ]);
}

// ── Generate human-readable onboarding ID ────────────────────────────────────
function generateOnboardingId(reg) {
  const date  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const token = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BRG-${date}-${reg}-${token}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.post('/', (req, res, next) => {
  // Use a random folder name so multer can start saving immediately,
  // before we know the vehicle registration.
  const folderToken = crypto.randomBytes(6).toString('hex');
  const uploadFolder = path.join(UPLOADS_ROOT, folderToken);
  const upload = makeUpload(uploadFolder);

  upload(req, res, async (multerErr) => {
    if (multerErr) return next(multerErr);

    validateSubmission(req, res, async (validErr) => {
      if (validErr) {
        // Clean up orphaned upload folder on validation failure
        fs.rm(uploadFolder, { recursive: true, force: true }, () => {});
        return next(validErr);
      }

      const d          = req.validated;
      const onboardingId = generateOnboardingId(d.vehicle_registration);

      // Build the definitive paths for each photo (already saved by multer)
      const photoPaths = {};
      for (const field of ['system_photo', 'network_photo', 'server_photo',
                           'registration_photo', 'vin_photo']) {
        const file = req.files?.[field]?.[0];
        if (file) photoPaths[field] = file.path;
      }

      try {
        // ── 4a. Vehicle lookup + OCR — run in parallel ───────────────────
        const [vehicleInfo, ocrResults] = await Promise.all([
          lookupVehicle(d.vehicle_registration, d.vin),
          runOcr(photoPaths).catch((err) => {
            console.error(JSON.stringify({
              ts: new Date().toISOString(), level: 'warn',
              msg: 'OCR pipeline failed', error: err.message,
            }));
            return {};
          }),
        ]);

        // ── 4b. Save record ──────────────────────────────────────────────
        await db.insert({
          onboarding_id:        onboardingId,
          product_type:         d.product_type,
          sim_number:           d.sim_number,
          device_id:            d.device_id,
          camera:               d.camera,
          channels:             JSON.stringify(d.channels),
          vehicle_registration: d.vehicle_registration,
          vin:                  d.vin,
          fleet_company:        d.fleet_company,
          depot:                d.depot,
          installation_date:    d.installation_date,
          installer_name:       d.installer_name,
          installer_company:    d.installer_company,
          installer_mobile:     d.installer_mobile,
          installer_email:      d.installer_email,
          comments:             d.comments,
          photos_folder:        uploadFolder,
          pdf_path:             '',
          vehicle_make:         vehicleInfo.make,
          vehicle_model:        vehicleInfo.model,
          vehicle_year:         vehicleInfo.year,
          vehicle_colour:       vehicleInfo.colour,
          vehicle_fuel_type:    vehicleInfo.fuelType,
          vehicle_lookup_source: vehicleInfo.source,
        });

        // ── 5. Generate PDF ──────────────────────────────────────────────
        const pdfBuffer = await generateCertificate(
          { ...d, onboarding_id: onboardingId, vehicleInfo },
          photoPaths,
          ocrResults
        );

        const pdfPath = path.join(uploadFolder, `${onboardingId}_certificate.pdf`);
        fs.writeFileSync(pdfPath, pdfBuffer);
        await db.updatePdfPath(onboardingId, pdfPath);

        // ── 6. Email (non-blocking) ──────────────────────────────────────
        sendConfirmation(
          { ...d, onboarding_id: onboardingId, vehicleInfo },
          pdfBuffer,
          photoPaths,
          ocrResults
        )
          .catch((err) => console.error(JSON.stringify({
            ts: new Date().toISOString(), level: 'error',
            msg: 'Email delivery failed', id: onboardingId, error: err.message,
          })));

        // ── 7. Respond ───────────────────────────────────────────────────
        return res.status(201).json({
          success: true,
          onboardingId,
          message: 'Installation recorded. A confirmation email will be sent shortly.',
        });

      } catch (err) {
        next(err);
      }
    });
  });
});

module.exports = router;
