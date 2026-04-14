'use strict';

/**
 * PDF Certificate — reads photos from disk paths (no buffers in memory).
 * Returns a Buffer so it can be emailed as an attachment.
 */

const PDFDocument = require('pdfkit');
const fs          = require('fs');

const BLUE  = '#003087';
const GREY  = '#4a4a4a';
const LIGHT = '#f0f4fb';

async function generateCertificate(data, photoPaths) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: 50,
      bufferPages: true,          // required to call switchToPage() for footers
      info: {
        Title:  `Brigade Installation Certificate — ${data.onboarding_id}`,
        Author: 'Brigade Electronics Onboarding',
      },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try { build(doc, data, photoPaths); }
    catch (err) { reject(err); }

    doc.end();
  });
}

// ── Build document ─────────────────────────────────────────────────────────────
function build(doc, d, photos) {
  // Header
  doc.rect(50, 40, doc.page.width - 100, 60).fill(BLUE);
  doc.fontSize(18).fillColor('#fff').text('Brigade Electronics', 65, 52, { continued: true });
  doc.fontSize(11).text('  —  Installation Certificate');
  doc.fontSize(9).fillColor('#cce').text(
    `Ref: ${d.onboarding_id}  |  Date: ${d.installation_date}  |  Reg: ${d.vehicle_registration}`,
    65, 76
  );
  doc.y = 120;

  // Sections
  section(doc, 'Installation Details', [
    ['Reference',      d.onboarding_id],
    ['Product',        d.product_type],
    ['Device ID',      d.device_id],
    ['SIM Number',     d.sim_number],
    ['Camera Fitted',  d.camera],
    ['Fleet/Company',  d.fleet_company],
    ['Depot',          d.depot],
    ['Install Date',   d.installation_date],
  ]);

  doc.moveDown(0.5);

  const v = d.vehicleInfo || {};
  section(doc, 'Vehicle', [
    ['Registration', d.vehicle_registration],
    ['VIN',          d.vin],
    ['Make',         v.make   || '—'],
    ['Model',        v.model  || '—'],
    ['Year',         v.year   || '—'],
    ['Colour',       v.colour || '—'],
    ['Fuel Type',    v.fuelType || '—'],
    ['Data Source',  v.source || '—'],
  ]);

  doc.moveDown(0.5);

  section(doc, 'Installer', [
    ['Name',    d.installer_name],
    ['Company', d.installer_company],
    ['Mobile',  d.installer_mobile],
    ['Email',   d.installer_email],
  ]);

  if (d.camera === 'Yes' && d.channels) {
    doc.moveDown(0.5);
    const chRows = Object.entries(
      typeof d.channels === 'string' ? JSON.parse(d.channels) : d.channels
    ).map(([k, v]) => [k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()), v]);
    section(doc, 'Camera Channels', chRows);
  }

  if (d.comments) {
    doc.moveDown(0.5).fontSize(11).fillColor(BLUE).text('Comments', { underline: true });
    doc.fontSize(10).fillColor(GREY).text(d.comments);
  }

  // Photos — 2 per page
  const photoEntries = [
    ['System Photo',       photos.system_photo],
    ['Network Photo',      photos.network_photo],
    ['Server Photo',       photos.server_photo],
    ['Registration Photo', photos.registration_photo],
    ['VIN Photo',          photos.vin_photo],
  ].filter(([, p]) => p && fs.existsSync(p));

  let slot = 0;
  for (const [label, filePath] of photoEntries) {
    if (slot % 2 === 0) { doc.addPage(); slot = 0; }
    const y = slot === 0 ? 60 : 430;
    doc.fontSize(11).fillColor(BLUE).text(label, 50, y - 16);
    try {
      doc.image(filePath, 50, y, { fit: [495, 340], align: 'center' });
    } catch {
      doc.fontSize(9).fillColor(GREY).text('[Image unavailable]', 50, y);
    }
    slot++;
  }

  // Footer on every page
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#999').text(
      `Brigade Electronics · ${d.onboarding_id} · Page ${i + 1} of ${total}`,
      50, doc.page.height - 30, { align: 'center' }
    );
  }
}

// ── Section table ──────────────────────────────────────────────────────────────
function section(doc, title, rows) {
  doc.fontSize(11).fillColor(BLUE).text(title, { underline: true });
  doc.moveDown(0.25);
  const colW = (doc.page.width - 100) / 2;
  const rowH = 18;
  let y = doc.y;
  rows.forEach(([label, value], i) => {
    doc.rect(50, y, doc.page.width - 100, rowH).fill(i % 2 === 0 ? LIGHT : '#fff');
    doc.fontSize(9).fillColor('#222')
       .text(label,          55, y + 4, { width: colW - 10 })
       .text(String(value || '—'), 55 + colW, y + 4, { width: colW - 10 });
    y += rowH;
  });
  doc.y = y + 6;
}

module.exports = { generateCertificate };
