'use strict';

const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');

const LOGO     = path.resolve(__dirname, '..', '..', 'public', 'blue logo.png');
const BRAND    = '#003087';
const DIVIDER  = '#cccccc';
const BODY     = '#333333';
const LABEL    = '#555555';

function fmt(val) { return val || '—'; }

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('en-GB');
}

function drawDivider(doc) {
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(DIVIDER).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

function sectionHeader(doc, title) {
  doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND)
     .text(title.toUpperCase(), { characterSpacing: 0.8 });
  doc.moveDown(0.3);
}

function field(doc, label, value, opts = {}) {
  doc.fontSize(8).font('Helvetica-Bold').fillColor(LABEL).text(label + ':', { continued: !opts.block });
  if (opts.block) {
    doc.moveDown(0.1);
    doc.fontSize(9).font('Helvetica').fillColor(BODY).text(fmt(value));
  } else {
    doc.fontSize(9).font('Helvetica').fillColor(BODY).text(' ' + fmt(value));
  }
  doc.moveDown(0.2);
}

function generateJobPdf(job, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${job.ref}.pdf"`);
  doc.pipe(res);

  const PW = doc.page.width;

  // ── Header ────────────────────────────────────────────────────────────────
  if (fs.existsSync(LOGO)) {
    doc.image(LOGO, 50, 38, { height: 48 });
  }
  doc.fontSize(18).font('Helvetica-Bold').fillColor(BRAND)
     .text('BRIGADE ELECTRONICS', 108, 42);
  doc.fontSize(10).font('Helvetica').fillColor(LABEL)
     .text('Job Sheet', 108, 64);

  // Ref & date top-right
  doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND)
     .text(job.ref, PW - 50, 42, { align: 'right', width: 160 });
  doc.fontSize(8).font('Helvetica').fillColor(LABEL)
     .text(`Created ${fmtDate(job.created_at)}`, PW - 50, 56, { align: 'right', width: 160 });

  doc.y = 100;
  drawDivider(doc);

  // ── Two-column summary ────────────────────────────────────────────────────
  const col1 = 50;
  const col2 = PW / 2 + 10;
  const savedY = doc.y;

  // Left column
  doc.y = savedY;
  sectionHeader(doc, 'Customer & Site');
  field(doc, 'Customer', job.customer_name);
  field(doc, 'Site Location', job.site_location);
  field(doc, 'Date of Attendance', fmtDate(job.date_of_attendance));
  field(doc, 'Vehicle Registration', job.vehicle_reg);

  const afterLeftY = doc.y;

  // Right column
  doc.y = savedY;
  sectionHeader(doc, 'Engineer');
  doc.x = col2;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(LABEL).text('Engineer:', col2, doc.y, { continued: true });
  doc.fontSize(9).font('Helvetica').fillColor(BODY).text(' ' + fmt(job.engineer_name));
  doc.moveDown(0.2);
  doc.fontSize(8).font('Helvetica-Bold').fillColor(LABEL).text('Company:', col2, doc.y, { continued: true });
  doc.fontSize(9).font('Helvetica').fillColor(BODY).text(' ' + fmt(job.engineer_company));
  doc.moveDown(0.2);

  doc.y = Math.max(afterLeftY, doc.y);
  doc.x = col1;
  drawDivider(doc);

  // ── Job Details ───────────────────────────────────────────────────────────
  sectionHeader(doc, 'Issue Reported');
  doc.fontSize(9).font('Helvetica').fillColor(BODY).text(fmt(job.issue_reported), { lineGap: 2 });
  doc.moveDown(0.5);

  sectionHeader(doc, 'Work Carried Out');
  doc.fontSize(9).font('Helvetica').fillColor(BODY).text(fmt(job.work_carried_out), { lineGap: 2 });
  doc.moveDown(0.5);

  sectionHeader(doc, 'Outcome');
  doc.fontSize(9).font('Helvetica').fillColor(BODY).text(fmt(job.outcome), { lineGap: 2 });

  drawDivider(doc);

  // ── Parts Used ────────────────────────────────────────────────────────────
  sectionHeader(doc, 'Parts Used');
  const parts = Array.isArray(job.parts_used) ? job.parts_used.filter((p) => p.name) : [];
  if (parts.length) {
    const tl = 50;
    const ql = PW - 130;
    const tw = ql - tl - 10;

    // Header row
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BRAND);
    doc.text('Part / Description', tl, doc.y, { width: tw, continued: false });
    const hRowY = doc.y - doc.currentLineHeight();
    doc.text('Qty', ql, hRowY, { width: 80, align: 'right' });
    doc.moveDown(0.2);
    doc.moveTo(tl, doc.y).lineTo(PW - 50, doc.y).strokeColor(DIVIDER).lineWidth(0.5).stroke();
    doc.moveDown(0.3);

    parts.forEach((p) => {
      doc.fontSize(9).font('Helvetica').fillColor(BODY);
      const rowY = doc.y;
      doc.text(p.name || '', tl, rowY, { width: tw });
      const rowH = doc.y - rowY;
      doc.text(String(p.quantity || 1), ql, rowY, { width: 80, align: 'right' });
      doc.y = rowY + rowH;
      doc.moveDown(0.2);
    });
  } else {
    doc.fontSize(9).font('Helvetica').fillColor(LABEL).text('None listed.');
    doc.moveDown(0.3);
  }

  doc.moveDown(0.2);
  field(doc, 'Unused Kit', job.unused_kit || 'None');

  drawDivider(doc);

  // ── Photos ────────────────────────────────────────────────────────────────
  const photos = (job.photos || []).filter((p) => p && fs.existsSync(p));
  if (photos.length) {
    sectionHeader(doc, 'Photos');

    const photoW  = (PW - 120) / 2;
    const photoH  = 180;
    const gapX    = 20;

    let col = 0;
    let rowStartY = doc.y;

    photos.forEach((photoPath, i) => {
      const x = 50 + col * (photoW + gapX);
      const y = rowStartY;

      if (y + photoH > doc.page.height - 60) {
        doc.addPage();
        rowStartY = 50;
        col = 0;
      }

      try {
        doc.image(photoPath, x, rowStartY, { width: photoW, height: photoH, fit: [photoW, photoH], align: 'center', valign: 'center' });
      } catch (_) {}

      doc.fontSize(7).font('Helvetica').fillColor(LABEL)
         .text(`Photo ${i + 1}`, x, rowStartY + photoH + 2, { width: photoW, align: 'center' });

      col++;
      if (col === 2) {
        col = 0;
        rowStartY += photoH + 20;
        doc.y = rowStartY;
      }
    });

    if (col > 0) {
      doc.y = rowStartY + photoH + 20;
    }

    drawDivider(doc);
  }

  // ── Signature ─────────────────────────────────────────────────────────────
  sectionHeader(doc, 'Engineer Signature');

  if (job.signature_path && fs.existsSync(job.signature_path)) {
    if (doc.y + 80 > doc.page.height - 60) doc.addPage();
    doc.rect(50, doc.y, 260, 70).strokeColor(DIVIDER).lineWidth(0.5).stroke();
    try {
      doc.image(job.signature_path, 52, doc.y + 2, { width: 256, height: 66, fit: [256, 66] });
    } catch (_) {}
    doc.y += 75;
  } else {
    doc.fontSize(9).font('Helvetica').fillColor(LABEL).text('Signature not provided.');
  }

  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(BODY).text(fmt(job.engineer_name));

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange ? doc.bufferedPageRange().count : 1;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).font('Helvetica').fillColor(LABEL)
       .text(`Brigade Electronics Ltd — ${job.ref} — Generated ${new Date().toLocaleDateString('en-GB')}`,
             50, doc.page.height - 35, { width: PW - 100, align: 'center' });
  }

  doc.end();
}

module.exports = generateJobPdf;
