'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const jobsDb  = require('../jobsDb');

const router = express.Router();

const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_ROOT, 'jobs', req._jobRef);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `photo-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter: (_, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// Assign ref before multer so the destination callback can use it
router.post('/', (req, res, next) => {
  req._jobRef = jobsDb.generateRef();
  next();
}, upload.array('photos', 5), async (req, res, next) => {
  try {
    const {
      customer_name, site_location, date_of_attendance,
      engineer_name, engineer_company, vehicle_reg,
      issue_reported, work_carried_out, outcome,
      parts_used, unused_kit, signature,
    } = req.body;

    const ref = req._jobRef;

    let signaturePath = null;
    if (signature && signature.startsWith('data:image/')) {
      const base64 = signature.replace(/^data:image\/\w+;base64,/, '');
      const dir    = path.join(UPLOADS_ROOT, 'jobs', ref);
      fs.mkdirSync(dir, { recursive: true });
      signaturePath = path.join(dir, 'signature.png');
      fs.writeFileSync(signaturePath, Buffer.from(base64, 'base64'));
    }

    let parts = [];
    try { parts = JSON.parse(parts_used || '[]'); } catch {}

    await jobsDb.insert({
      ref,
      customer_name:      customer_name      || '',
      site_location:      site_location      || '',
      date_of_attendance: date_of_attendance || '',
      engineer_name:      engineer_name      || '',
      engineer_company:   engineer_company   || '',
      vehicle_reg:        (vehicle_reg || '').toUpperCase(),
      issue_reported:     issue_reported     || '',
      work_carried_out:   work_carried_out   || '',
      outcome:            outcome            || '',
      parts_used:         parts,
      unused_kit:         unused_kit         || '',
      signature_path:     signaturePath,
      photos:             (req.files || []).map((f) => f.path),
    });

    res.json({ success: true, ref });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
