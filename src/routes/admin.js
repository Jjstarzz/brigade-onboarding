'use strict';

/**
 * /admin — simple password-protected submissions dashboard.
 *
 * Auth: HTTP Basic Auth checked against ADMIN_PASSWORD env var.
 * No framework, no extra packages — just HTML generated server-side.
 *
 * Routes:
 *   GET  /admin           → submissions table
 *   GET  /admin/export    → download all rows as CSV
 *   GET  /admin/pdf/:id   → download a specific PDF
 */

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

const router = express.Router();

// ── Basic Auth middleware ─────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const b64    = header.startsWith('Basic ') ? header.slice(6) : '';
  const [, pass] = Buffer.from(b64, 'base64').toString().split(':');

  if (pass && pass === process.env.ADMIN_PASSWORD) return next();

  res.set('WWW-Authenticate', 'Basic realm="Brigade Admin"');
  res.status(401).send('Authentication required.');
}

router.use(requireAuth);

// ── GET /admin ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.getAll();

  const tableRows = rows.map((r) => `
    <tr>
      <td>${r.created_at.slice(0, 10)}</td>
      <td><strong>${r.onboarding_id}</strong></td>
      <td>${r.vehicle_registration}</td>
      <td>${r.product_type}</td>
      <td>${r.fleet_company}</td>
      <td>${r.installer_name}</td>
      <td>${r.installer_email}</td>
      <td>${r.camera}</td>
      <td>
        ${r.pdf_path && fs.existsSync(r.pdf_path)
          ? `<a href="/admin/pdf/${encodeURIComponent(r.onboarding_id)}">📄 PDF</a>`
          : '—'}
      </td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Brigade Admin — Submissions</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; background: #f4f6fa; color: #1a1a1a; }
    header { background: #003087; color: #fff; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 1.1rem; }
    .toolbar { padding: 16px 24px; display: flex; gap: 12px; align-items: center; }
    .btn { padding: 8px 16px; background: #003087; color: #fff; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; font-size: .875rem; }
    .btn:hover { background: #0057c8; }
    .count { font-size: .875rem; color: #555; }
    .table-wrap { overflow-x: auto; padding: 0 24px 40px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    th { background: #003087; color: #fff; padding: 10px 12px; text-align: left; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
    td { padding: 10px 12px; font-size: .875rem; border-bottom: 1px solid #eee; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f0f4fb; }
    a { color: #003087; }
    .empty { text-align: center; padding: 40px; color: #888; }
  </style>
</head>
<body>
  <header>
    <h1>Brigade Electronics — Installation Records</h1>
    <span style="font-size:.85rem;opacity:.75">${new Date().toLocaleDateString('en-GB')}</span>
  </header>
  <div class="toolbar">
    <a class="btn" href="/admin/export">⬇ Export CSV</a>
    <span class="count">${rows.length} submission${rows.length !== 1 ? 's' : ''}</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Reference</th><th>Reg</th><th>Product</th>
          <th>Fleet/Company</th><th>Installer</th><th>Email</th>
          <th>Camera</th><th>PDF</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? tableRows : '<tr><td colspan="9" class="empty">No submissions yet.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`);
});

// ── GET /admin/export ─────────────────────────────────────────────────────────
router.get('/export', (req, res) => {
  const rows = db.getAll();

  const headers = [
    'created_at', 'onboarding_id', 'product_type', 'sim_number', 'device_id',
    'camera', 'vehicle_registration', 'vin', 'fleet_company', 'depot',
    'installation_date', 'installer_name', 'installer_company',
    'installer_mobile', 'installer_email', 'comments',
  ];

  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(',')
    ),
  ];

  const filename = `brigade_submissions_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvRows.join('\n'));
});

// ── GET /admin/pdf/:id ────────────────────────────────────────────────────────
router.get('/pdf/:id', (req, res) => {
  // Sanitise the ID — only allow characters used in our generated IDs
  const id = req.params.id.replace(/[^A-Z0-9-]/gi, '');
  const row = db.getById(id);

  if (!row || !row.pdf_path) {
    return res.status(404).send('PDF not found.');
  }

  const safePath = path.normalize(row.pdf_path);

  // Ensure the path stays within the uploads directory (path traversal guard)
  const uploadsRoot = path.resolve(
    process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads')
  );
  if (!safePath.startsWith(uploadsRoot)) {
    return res.status(403).send('Forbidden.');
  }

  if (!fs.existsSync(safePath)) {
    return res.status(404).send('PDF file not found on disk.');
  }

  res.download(safePath, `${id}_certificate.pdf`);
});

module.exports = router;
