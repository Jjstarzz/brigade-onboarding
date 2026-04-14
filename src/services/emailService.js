'use strict';

const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    secure: true,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  });
}

function getRecipients(installerEmail) {
  const fixed = (process.env.EMAIL_RECIPIENTS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...fixed, installerEmail.toLowerCase()])];
}

/**
 * Send confirmation email with PDF + photos attached.
 * @param {Object} data       - validated submission data
 * @param {Buffer} pdfBuffer  - generated PDF
 * @param {Object} photoPaths - { field_name: '/absolute/path/to/file.jpg' }
 */
async function sendConfirmation(data, pdfBuffer, photoPaths) {
  const transport  = createTransport();
  const recipients = getRecipients(data.installer_email);

  // Photo attachments (only files that exist on disk)
  const photoAttachments = Object.entries(photoPaths)
    .filter(([, p]) => p && fs.existsSync(p))
    .map(([field, filePath]) => ({
      filename: `${field}${path.extname(filePath)}`,
      path: filePath,
    }));

  await transport.sendMail({
    from:    `"Brigade Electronics Onboarding" <${process.env.EMAIL_USER}>`,
    to:      recipients.join(', '),
    subject: `Installation Certificate — ${data.vehicle_registration} — ${data.onboarding_id}`,
    html:    buildHtml(data),
    attachments: [
      {
        filename:    `${data.onboarding_id}_certificate.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      },
      ...photoAttachments,
    ],
  });

  console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'Email sent',
    id: data.onboarding_id, recipients }));
}

function buildHtml(d) {
  return `<!DOCTYPE html><html lang="en"><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#003087;color:#fff;padding:20px;border-radius:4px 4px 0 0">
    <h1 style="margin:0;font-size:20px">Brigade Electronics</h1>
    <p style="margin:4px 0 0;opacity:.8">Vehicle Installation Certificate</p>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:20px">
    <p>Dear ${d.installer_name},</p>
    <p>Your installation has been recorded. The PDF certificate and photos are attached.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      ${row('Reference ID', d.onboarding_id, true)}
      ${row('Product', d.product_type)}
      ${row('Vehicle', d.vehicle_registration, true)}
      ${row('VIN', d.vin)}
      ${row('Fleet/Company', d.fleet_company, true)}
      ${row('Depot', d.depot)}
      ${row('Install Date', d.installation_date, true)}
      ${row('Installer', `${d.installer_name} (${d.installer_company})`)}
    </table>
    ${d.comments ? `<p><strong>Comments:</strong> ${d.comments}</p>` : ''}
    <p style="font-size:12px;color:#666;margin-top:20px">
      Automated message — do not reply.
    </p>
  </div>
</body></html>`;
}

const row = (label, value, shaded = false) =>
  `<tr style="background:${shaded ? '#f5f5f5' : '#fff'}">
    <td style="padding:6px 10px;font-weight:bold;width:40%">${label}</td>
    <td style="padding:6px 10px">${value || '—'}</td>
  </tr>`;

module.exports = { sendConfirmation };
