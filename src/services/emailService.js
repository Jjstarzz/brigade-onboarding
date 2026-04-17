'use strict';

/**
 * Email service — uses SendGrid (HTTPS API, not SMTP).
 * Works on Railway free tier where SMTP ports are blocked.
 *
 * Requires env vars:
 *   SENDGRID_API_KEY  — API key from app.sendgrid.com
 *   EMAIL_RECIPIENTS  — comma-separated always-CC list
 *
 * The "from" address must be a Verified Sender in your SendGrid account.
 * Set it via SENDGRID_FROM env var, or update the FROM constant below.
 */

const sgMail = require('@sendgrid/mail');
const fs     = require('fs');
const path   = require('path');

const FROM = process.env.SENDGRID_FROM || 'joel.jijo@brigade-halo.com';

// Friendly labels for photo field names
const PHOTO_LABELS = {
  system_photo:       'System Photo',
  network_photo:      'Network Photo',
  server_photo:       'Server Photo',
  registration_photo: 'Registration Photo',
  vin_photo:          'VIN Photo',
};

function getRecipients(installerEmail) {
  const fixed = (process.env.EMAIL_RECIPIENTS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...fixed, installerEmail.toLowerCase()])];
}

/**
 * Send confirmation email with PDF + photos attached.
 * @param {Object} data        - validated submission data
 * @param {Buffer} pdfBuffer   - generated PDF
 * @param {Object} photoPaths  - { field_name: '/absolute/path/to/file.jpg' }
 * @param {Object} ocrResults  - { field_name: { text, confidence, patterns } | null }
 */
async function sendConfirmation(data, pdfBuffer, photoPaths, ocrResults = {}) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const recipients = getRecipients(data.installer_email);

  // Build photo attachments — SendGrid requires base64-encoded content
  const photoAttachments = Object.entries(photoPaths)
    .filter(([, p]) => p && fs.existsSync(p))
    .map(([field, filePath]) => {
      const ext     = path.extname(filePath).toLowerCase().replace('.', '');
      const mime    = ext === 'png' ? 'image/png' : 'image/jpeg';
      return {
        content:     fs.readFileSync(filePath).toString('base64'),
        filename:    `${field}${path.extname(filePath)}`,
        type:        mime,
        disposition: 'attachment',
      };
    });

  const msg = {
    to:      recipients,
    from:    FROM,
    subject: `Installation Certificate — ${data.vehicle_registration} — ${data.onboarding_id}`,
    html:    buildHtml(data, ocrResults),
    attachments: [
      {
        content:     pdfBuffer.toString('base64'),
        filename:    `${data.onboarding_id}_certificate.pdf`,
        type:        'application/pdf',
        disposition: 'attachment',
      },
      ...photoAttachments,
    ],
  };

  await sgMail.send(msg);

  console.log(JSON.stringify({
    ts: new Date().toISOString(), msg: 'Email sent via SendGrid',
    id: data.onboarding_id, recipients,
  }));
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildOcrSection(ocrResults) {
  const entries = Object.entries(ocrResults).filter(([, r]) => r && r.text);
  if (!entries.length) return '';

  const cards = entries.map(([field, r]) => {
    const label    = PHOTO_LABELS[field] || field;
    const patterns = [];
    if (r.patterns.regPlate) patterns.push(`<strong>Reg detected:</strong> ${r.patterns.regPlate}`);
    if (r.patterns.vin)      patterns.push(`<strong>VIN detected:</strong> ${r.patterns.vin}`);
    const patternHtml = patterns.length
      ? `<div style="margin-bottom:4px;color:#003087">${patterns.join(' &nbsp;·&nbsp; ')}</div>`
      : '';
    const escapedText = r.text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    return `
      <div style="margin-bottom:12px;border-left:3px solid #003087;padding:8px 12px;background:#f8f9fa;border-radius:0 4px 4px 0">
        <div style="font-weight:bold;font-size:13px;margin-bottom:4px">${label}
          <span style="font-weight:normal;color:#888;font-size:11px">&nbsp;(confidence: ${r.confidence}%)</span>
        </div>
        ${patternHtml}
        <div style="font-size:12px;color:#444;font-family:monospace;line-height:1.5">${escapedText}</div>
      </div>`;
  }).join('');

  return `
    <h3 style="font-size:14px;color:#003087;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px">
      Auto-detected Text in Photos
    </h3>
    <p style="font-size:11px;color:#888;margin:0 0 12px">
      Extracted automatically by OCR — may contain errors. Verify against original photos.
    </p>
    ${cards}`;
}

function buildHtml(d, ocrResults = {}) {
  const v           = d.vehicleInfo || {};
  const vehicleDesc = [v.year, v.make, v.model].filter(Boolean).join(' ') || '—';

  return `<!DOCTYPE html><html lang="en"><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#003087;color:#fff;padding:20px;border-radius:4px 4px 0 0">
    <h1 style="margin:0;font-size:20px">Brigade Electronics</h1>
    <p style="margin:4px 0 0;opacity:.8">Vehicle Installation Certificate</p>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:20px">
    <p>Dear ${d.installer_name},</p>
    <p>Your installation has been recorded. The PDF certificate and photos are attached.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      ${row('Reference ID',  d.onboarding_id, true)}
      ${row('Product',       d.product_type)}
      ${row('Registration',  d.vehicle_registration, true)}
      ${row('Vehicle',       vehicleDesc)}
      ${row('Colour',        v.colour   || '—', true)}
      ${row('Fuel Type',     v.fuelType || '—')}
      ${row('VIN',           d.vin, true)}
      ${row('Fleet/Company', d.fleet_company)}
      ${row('Depot',         d.depot, true)}
      ${row('Install Date',  d.installation_date)}
      ${row('Installer',     `${d.installer_name} (${d.installer_company})`, true)}
    </table>
    ${d.comments ? `<p><strong>Comments:</strong> ${d.comments}</p>` : ''}
    ${buildOcrSection(ocrResults)}
    <p style="font-size:12px;color:#666;margin-top:20px">Automated message — do not reply.</p>
  </div>
</body></html>`;
}

const row = (label, value, shaded = false) =>
  `<tr style="background:${shaded ? '#f5f5f5' : '#fff'}">
    <td style="padding:6px 10px;font-weight:bold;width:40%">${label}</td>
    <td style="padding:6px 10px">${value || '—'}</td>
  </tr>`;

module.exports = { sendConfirmation };
