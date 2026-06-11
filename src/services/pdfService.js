'use strict';

const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const BLUE  = '#003087';
const DBLUE = '#00245c';
const LIGHT = '#f0f4fb';
const GREY  = '#333';
const MID   = '#666';
const LOGO  = path.resolve(__dirname, '..', '..', 'public', 'blue logo.png');

async function generateCertificate(data, photoPaths, ocrResults = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: 50,
      bufferPages: true,
      info: {
        Title:  `Brigade Certificate — ${data.onboarding_id}`,
        Author: 'Brigade Electronics',
      },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try { build(doc, data, photoPaths, ocrResults); }
    catch (err) { reject(err); }
    doc.end();
  });
}

// ── Main builder ───────────────────────────────────────────────────────────────
function build(doc, d, photos, ocrResults) {
  const PW = doc.page.width;
  const W  = PW - 100;

  // ── Header band ─────────────────────────────────────────────────────────────
  doc.rect(50, 40, W, 56).fill(BLUE);
  if (fs.existsSync(LOGO)) {
    try { doc.image(LOGO, 56, 44, { height: 46 }); } catch (_) {}
  }
  doc.fontSize(15).fillColor('#fff').font('Helvetica-Bold')
     .text('Brigade Electronics', 112, 48, { lineBreak: false });
  doc.fontSize(8.5).fillColor('#b0c4e8').font('Helvetica')
     .text('Installation & Job Sheet Certificate', 112, 67, { lineBreak: false });

  // Ref block — right-aligned inside header
  doc.fontSize(7).fillColor('#cce').font('Helvetica')
     .text(`Ref: ${d.onboarding_id}`, PW - 250, 50, { width: 198, align: 'right', lineBreak: false });
  doc.text(`Date: ${d.installation_date || '—'}`, PW - 250, 62, { width: 198, align: 'right', lineBreak: false });
  doc.text(`Reg: ${d.vehicle_registration}`, PW - 250, 74, { width: 198, align: 'right', lineBreak: false });

  doc.y = 108;

  // ── Row 1: Installation Details + Vehicle ────────────────────────────────────
  const halfW = Math.floor((W - 10) / 2);
  const c2x   = 50 + halfW + 10;

  const v = d.vehicleInfo || {};
  const top1 = doc.y;
  colSection(doc, 50, halfW, 'Installation Details', [
    ['Reference',     d.onboarding_id],
    ['Product',       d.product_type],
    ['Device ID',     d.device_id],
    ['SIM Number',    d.sim_number],
    ['Camera Fitted', d.camera],
    ['Fleet/Company', d.fleet_company],
    ['Depot',         d.depot],
    ['Install Date',  d.installation_date],
  ]);
  const bot1L = doc.y;

  doc.y = top1;
  colSection(doc, c2x, halfW, 'Vehicle', [
    ['Registration', d.vehicle_registration],
    ['VIN',          d.vin],
    ['Make',         v.make      || '—'],
    ['Model',        v.model     || '—'],
    ['Year',         v.year      || '—'],
    ['Colour',       v.colour    || '—'],
    ['Fuel Type',    v.fuelType  || '—'],
  ]);
  const bot1R = doc.y;

  doc.y = Math.max(bot1L, bot1R) + 8;

  // ── Row 2: Installer + Camera Channels (or Comments) ────────────────────────
  const top2 = doc.y;
  colSection(doc, 50, halfW, 'Installer', [
    ['Name',    d.installer_name],
    ['Company', d.installer_company],
    ['Mobile',  d.installer_mobile],
    ['Email',   d.installer_email],
  ]);
  const bot2L = doc.y;

  doc.y = top2;
  if (d.camera === 'Yes' && d.channels) {
    const ch = typeof d.channels === 'string' ? JSON.parse(d.channels) : d.channels;
    colSection(doc, c2x, halfW, 'Camera Channels',
      Object.entries(ch).map(([k, v]) => [
        k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()), v,
      ])
    );
  } else if (d.comments) {
    colSection(doc, c2x, halfW, 'Comments', [['Notes', d.comments]]);
  }
  const bot2R = doc.y;

  doc.y = Math.max(bot2L, bot2R) + 12;

  // ── Job Sheet ────────────────────────────────────────────────────────────────
  const hasJobSheet = d.issue_reported || d.work_carried_out || d.outcome ||
    (Array.isArray(d.parts_used) && d.parts_used.length) ||
    d.unused_kit || d.signature_path;

  if (hasJobSheet) {
    // Divider bar — no new page, just continues flowing
    const divY = doc.y;
    doc.rect(50, divY, W, 20).fill(DBLUE);
    doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold')
       .text('JOB SHEET', 56, divY + 6, { width: W - 12, characterSpacing: 1 });
    doc.y = divY + 28;

    const txtFields = [
      ['Issue Reported',   d.issue_reported],
      ['Work Carried Out', d.work_carried_out],
      ['Outcome',          d.outcome],
    ];
    txtFields.forEach(([label, val]) => {
      if (!val) return;
      textBlock(doc, label, val, W);
    });

    const parts = (Array.isArray(d.parts_used) ? d.parts_used : []).filter((p) => p.name);
    if (parts.length) partsTable(doc, parts, W);

    if (d.unused_kit) textBlock(doc, 'Unused Kit', d.unused_kit, W);

    if (d.signature_path && fs.existsSync(d.signature_path)) {
      signatureBlock(doc, d.signature_path, d.installer_name);
    }
  }

  // ── Photos ───────────────────────────────────────────────────────────────────
  const workPhotoEntries = (d.work_photos || [])
    .filter((p) => p && fs.existsSync(p))
    .map((p, i) => [`Work Photo ${i + 1}`, `work_${i}`, p]);

  const photoEntries = [
    ['System Photo',       'system_photo',       photos.system_photo],
    ['Network Photo',      'network_photo',      photos.network_photo],
    ['Server Photo',       'server_photo',       photos.server_photo],
    ['Registration Photo', 'registration_photo', photos.registration_photo],
    ['VIN Photo',          'vin_photo',          photos.vin_photo],
    ...workPhotoEntries,
  ].filter(([,, p]) => p && fs.existsSync(p));

  let slot = 0;
  for (const [label, field, filePath] of photoEntries) {
    if (slot % 2 === 0) { doc.addPage(); slot = 0; }

    const labelY = slot === 0 ? 44  : 420;
    const imgY   = slot === 0 ? 60  : 436;
    const capY   = slot === 0 ? 310 : 686;

    doc.fontSize(9).fillColor(BLUE).font('Helvetica-Bold').text(label, 50, labelY);
    try {
      doc.image(filePath, 50, imgY, { fit: [W, 245], align: 'center' });
    } catch {
      doc.fontSize(9).fillColor(MID).text('[Image unavailable]', 50, imgY);
    }

    const ocr = ocrResults?.[field];
    if (ocr?.text) {
      doc.rect(50, capY, W, 68).fill('#f8f9fa');
      doc.rect(50, capY, 3,  68).fill(BLUE);
      doc.fontSize(7).fillColor('#888')
         .text(`Detected text (confidence: ${ocr.confidence}%)`, 58, capY + 5, { width: W - 16 });
      const textY = capY + 16;
      const maxT  = ocr.text.length > 300 ? ocr.text.slice(0, 297) + '…' : ocr.text;
      doc.fontSize(8).fillColor(GREY).text(maxT, 58, textY, { width: W - 16, lineGap: 1 });
    }

    slot++;
  }

  // ── Footers ─────────────────────────────────────────────────────────────────
  // Must zero bottom margin before writing near the page edge, otherwise
  // pdfkit treats the position as "past the margin" and creates overflow pages.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.rect(50, doc.page.height - 36, W, 18).fill('#f4f6fa');
    doc.fontSize(7).fillColor(MID).font('Helvetica')
       .text(
         `Brigade Electronics Ltd  ·  ${d.onboarding_id}  ·  Page ${i - range.start + 1} of ${range.count}`,
         50, doc.page.height - 30, { width: W, align: 'center', lineBreak: false }
       );

    doc.page.margins.bottom = savedBottom;
  }
}

// ── Column section ─────────────────────────────────────────────────────────────
function colSection(doc, x, w, title, rows) {
  let y = doc.y;
  const ROW = 16;

  // Header
  doc.rect(x, y, w, 18).fill(BLUE);
  doc.fontSize(7).fillColor('#fff').font('Helvetica-Bold')
     .text(title.toUpperCase(), x + 6, y + 5, { width: w - 12, lineBreak: false, characterSpacing: 0.5 });
  y += 18;

  const lw = Math.floor(w * 0.40);
  const vw = w - lw - 14;

  rows.forEach(([label, value], i) => {
    doc.rect(x, y, w, ROW).fill(i % 2 === 0 ? LIGHT : '#fff');
    doc.fontSize(7.5).fillColor(MID).font('Helvetica')
       .text(String(label), x + 5, y + 4, { width: lw, lineBreak: false });
    doc.fontSize(7.5).fillColor(GREY).font('Helvetica-Bold')
       .text(String(value || '—'), x + lw + 9, y + 4, { width: vw, lineBreak: false });
    y += ROW;
  });

  doc.rect(x, doc.y < y ? y : doc.y, w, 1).fill('#d0d8ea'); // bottom border
  doc.y = y + 2;
}

// ── Text block (full width, for narrative fields) ──────────────────────────────
function textBlock(doc, label, value, W) {
  doc.fontSize(7.5).fillColor(BLUE).font('Helvetica-Bold')
     .text(label.toUpperCase(), 50, doc.y, { characterSpacing: 0.4 });
  doc.moveDown(0.1);
  const boxTop = doc.y;
  doc.rect(50, boxTop, W, 1).fill('#c8d4e8');
  doc.moveDown(0.15);
  doc.fontSize(9).fillColor(GREY).font('Helvetica')
     .text(value, 54, doc.y, { width: W - 8, lineGap: 2 });
  doc.moveDown(0.55);
}

// ── Parts table ────────────────────────────────────────────────────────────────
function partsTable(doc, parts, W) {
  const qW = 48;
  const nW = W - qW;
  let   y  = doc.y;

  doc.fontSize(7.5).fillColor(BLUE).font('Helvetica-Bold')
     .text('PARTS USED', 50, y, { characterSpacing: 0.4 });
  y = doc.y + 4;

  // Header
  doc.rect(50, y, W, 16).fill(BLUE);
  doc.fontSize(7.5).fillColor('#fff').font('Helvetica-Bold')
     .text('Part / Description', 56, y + 4, { width: nW - 12, lineBreak: false });
  doc.text('Qty', 50 + nW + 2, y + 4, { width: qW - 8, align: 'right', lineBreak: false });
  y += 16;

  parts.forEach((p, i) => {
    doc.rect(50, y, W, 15).fill(i % 2 === 0 ? LIGHT : '#fff');
    doc.fontSize(8).fillColor(GREY).font('Helvetica')
       .text(p.name || '', 56, y + 3, { width: nW - 12, lineBreak: false });
    doc.text(String(p.quantity || 1), 50 + nW + 2, y + 3, { width: qW - 8, align: 'right', lineBreak: false });
    y += 15;
  });

  doc.y = y + 10;
}

// ── Signature block ────────────────────────────────────────────────────────────
function signatureBlock(doc, sigPath, name) {
  doc.fontSize(7.5).fillColor(BLUE).font('Helvetica-Bold')
     .text('ENGINEER SIGNATURE', 50, doc.y, { characterSpacing: 0.4 });
  doc.moveDown(0.15);
  const sigY = doc.y;
  doc.rect(50, sigY, 220, 58).strokeColor('#ccc').lineWidth(0.5).stroke();
  try {
    doc.image(sigPath, 52, sigY + 2, { width: 216, height: 54, fit: [216, 54] });
  } catch (_) {}
  doc.y = sigY + 62;
  doc.fontSize(8).fillColor(MID).font('Helvetica').text(name || '', 50, doc.y);
  doc.moveDown(0.5);
}

module.exports = { generateCertificate };
