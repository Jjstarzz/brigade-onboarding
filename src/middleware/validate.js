'use strict';

const PRODUCT_TYPES = ['MDR 504', 'MDR 508', 'MDR 641', 'MDR 644', 'DC-204-AI', 'CGLite'];

const CAMERA_CHANNELS = [
  'Front', 'Rear', 'Driver Facing', 'Left Side', 'Right Side',
  'Cabin Interior', 'Nearside', 'Offside', 'Reversing', 'Not Used',
];

const PHOTO_FIELDS = [
  'system_photo', 'network_photo', 'server_photo',
  'registration_photo', 'vin_photo',
];

function validateSubmission(req, res, next) {
  const b = req.body;
  const errors = [];

  if (!PRODUCT_TYPES.includes(b.product_type))
    errors.push('Invalid product type.');

  if (!/^\d{19}$/.test(b.sim_number))
    errors.push('SIM number must be exactly 19 digits.');

  if (!/^[A-Za-z0-9_-]{1,50}$/.test(b.device_id))
    errors.push('Device ID must be 1–50 alphanumeric characters.');

  const reg = (b.vehicle_registration || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,7}$/.test(reg))
    errors.push('Vehicle registration must be 2–7 uppercase alphanumeric, no spaces.');

  const vin = (b.vin || '').trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))
    errors.push('VIN must be 17 characters (A–Z, 0–9, excluding I/O/Q).');

  if (b.camera !== 'Yes' && b.camera !== 'No')
    errors.push('Camera field must be "Yes" or "No".');

  const channels = {};
  if (b.camera === 'Yes') {
    for (let i = 1; i <= 9; i++) {
      const ch = b[`channel_${i}`];
      if (!ch || !CAMERA_CHANNELS.includes(ch))
        errors.push(`Channel ${i} is required.`);
      else
        channels[`channel_${i}`] = ch;
    }
  }

  for (const field of ['fleet_company', 'depot', 'installer_name', 'installer_company']) {
    if (!b[field] || !b[field].trim())
      errors.push(`${field} is required.`);
  }

  if (!b.installation_date || isNaN(Date.parse(b.installation_date)))
    errors.push('Installation date is required.');

  if (!b.installer_mobile || !/^[0-9 +\-()]{7,20}$/.test(b.installer_mobile.trim()))
    errors.push('Installer mobile must be a valid phone number.');

  if (!b.installer_email || !/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(b.installer_email.trim()))
    errors.push('Installer email must be a valid email address.');

  // Photos are optional — OCR and PDF will simply omit missing images

  if (errors.length) {
    const err = new Error(errors.join(' | '));
    err.status = 400;
    return next(err);
  }

  req.validated = {
    product_type:         b.product_type,
    sim_number:           b.sim_number,
    device_id:            b.device_id.trim(),
    vehicle_registration: reg,
    vin,
    camera:               b.camera,
    channels,
    fleet_company:        b.fleet_company.trim(),
    depot:                b.depot.trim(),
    installation_date:    b.installation_date,
    installer_name:       b.installer_name.trim(),
    installer_company:    b.installer_company.trim(),
    installer_mobile:     b.installer_mobile.trim(),
    installer_email:      b.installer_email.trim().toLowerCase(),
    comments:             (b.comments || '').trim(),
  };

  next();
}

module.exports = { validateSubmission };
