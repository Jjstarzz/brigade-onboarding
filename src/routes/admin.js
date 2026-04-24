'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

const router = express.Router();

const PRODUCT_TYPES = ['MDR 504', 'MDR 508', 'MDR 641', 'MDR 644', 'DC-204-AI', 'CGLite'];
const STATUSES      = ['Pending', 'Reviewed', 'Approved', 'Flagged'];

const STATUS_META = {
  Pending:  { colour: '#888',    bg: '#f5f5f5' },
  Reviewed: { colour: '#0057c8', bg: '#e8f0fb' },
  Approved: { colour: '#1a7a3f', bg: '#e6f4ec' },
  Flagged:  { colour: '#c0392b', bg: '#fdecea' },
};

// ── Basic Auth ────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const b64    = header.startsWith('Basic ') ? header.slice(6) : '';
  const [, pass] = Buffer.from(b64, 'base64').toString().split(':');
  if (pass && pass === process.env.ADMIN_PASSWORD) return next();
  res.set('WWW-Authenticate', 'Basic realm="Brigade Admin"');
  res.status(401).send('Authentication required.');
}

router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '—')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// For HTML attribute values only — empty string stays empty
function escAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function statusSelect(id, current) {
  const opts = STATUSES.map((s) => {
    const m = STATUS_META[s];
    return `<option value="${s}" ${s === current ? 'selected' : ''} style="color:${m.colour}">${s}</option>`;
  }).join('');
  const m = STATUS_META[current] || STATUS_META.Pending;
  return `<select class="status-sel" data-id="${esc(id)}"
    style="color:${m.colour};background:${m.bg};border-color:${m.colour}"
    onchange="updateStatus(this)">${opts}</select>`;
}

// ── GET /admin ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { date_from, date_to, product_type, fleet_company, installer } = req.query;

  const allRows = db.getAll();

  // ── Filtered rows for the table ───────────────────────────────────────────
  let rows = allRows;
  if (date_from)    rows = rows.filter((r) => r.created_at >= date_from);
  if (date_to)      rows = rows.filter((r) => r.created_at <= date_to + 'T23:59:59.999Z');
  if (product_type) rows = rows.filter((r) => r.product_type === product_type);
  if (fleet_company) rows = rows.filter((r) =>
    (r.fleet_company || '').toLowerCase().includes(fleet_company.toLowerCase()));
  if (installer)    rows = rows.filter((r) =>
    (r.installer_name || '').toLowerCase().includes(installer.toLowerCase()));

  // ── Stats (always from all rows) ──────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRows = allRows.filter((r) => (r.created_at || '').startsWith(thisMonth));

  const productCounts = {};
  monthRows.forEach((r) => {
    if (r.product_type) productCounts[r.product_type] = (productCounts[r.product_type] || 0) + 1;
  });

  const installerCounts = {};
  allRows.forEach((r) => {
    if (r.installer_name) installerCounts[r.installer_name] = (installerCounts[r.installer_name] || 0) + 1;
  });
  const topInstaller = Object.entries(installerCounts).sort((a, b) => b[1] - a[1])[0];

  const statusCounts = { Pending: 0, Reviewed: 0, Approved: 0, Flagged: 0 };
  allRows.forEach((r) => {
    const s = r.status || 'Pending';
    if (s in statusCounts) statusCounts[s]++;
  });

  // ── Build stat cards ──────────────────────────────────────────────────────
  const productStatCards = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([p, c]) => `
      <div class="stat-card">
        <div class="stat-value">${c}</div>
        <div class="stat-label">${esc(p)}<br><span style="font-size:.7rem;opacity:.7">this month</span></div>
      </div>`).join('');

  const statusStatCards = STATUSES.map((s) => {
    const m = STATUS_META[s];
    return `
      <div class="stat-card" style="border-top:3px solid ${m.colour}">
        <div class="stat-value" style="color:${m.colour}">${statusCounts[s]}</div>
        <div class="stat-label">${s}</div>
      </div>`;
  }).join('');

  // ── Build table rows ──────────────────────────────────────────────────────
  const tableRows = rows.map((r) => {
    const status = r.status || 'Pending';
    return `
    <tr>
      <td>${esc(r.created_at.slice(0, 10))}</td>
      <td><strong>${esc(r.onboarding_id)}</strong></td>
      <td>${esc(r.vehicle_registration)}</td>
      <td>${esc(r.vin)}</td>
      <td>${esc([r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' '))}</td>
      <td>${esc(r.vehicle_colour)}</td>
      <td>${esc(r.vehicle_fuel_type)}</td>
      <td>${esc(r.product_type)}</td>
      <td>${esc(r.sim_number)}</td>
      <td>${esc(r.device_id)}</td>
      <td>${esc(r.camera)}</td>
      <td>${esc(r.fleet_company)}</td>
      <td>${esc(r.depot)}</td>
      <td>${esc(r.installation_date)}</td>
      <td>${esc(r.installer_name)}</td>
      <td>${esc(r.installer_company)}</td>
      <td>${esc(r.installer_mobile)}</td>
      <td>${esc(r.installer_email)}</td>
      <td>${esc(r.comments)}</td>
      <td>${statusSelect(r.onboarding_id, status)}</td>
      <td>
        ${r.pdf_path && fs.existsSync(r.pdf_path)
          ? `<a href="/admin/pdf/${encodeURIComponent(r.onboarding_id)}">📄 PDF</a>`
          : '—'}
      </td>
    </tr>`;
  }).join('');

  // ── Product type options for filter ───────────────────────────────────────
  const productOptions = PRODUCT_TYPES.map((p) =>
    `<option value="${p}" ${product_type === p ? 'selected' : ''}>${p}</option>`
  ).join('');

  const isFiltered = date_from || date_to || product_type || fleet_company || installer;

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

    /* Stats */
    .stats-section { padding: 20px 24px 0; }
    .stats-section h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: #555; margin-bottom: 10px; }
    .stats-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
    .stat-card { background: #fff; border-radius: 8px; padding: 14px 18px; min-width: 110px;
      box-shadow: 0 1px 4px rgba(0,0,0,.08); border-top: 3px solid #003087; text-align: center; }
    .stat-value { font-size: 1.8rem; font-weight: 700; color: #003087; line-height: 1; }
    .stat-label { font-size: .75rem; color: #666; margin-top: 4px; line-height: 1.3; }

    /* Filter */
    .filter-section { padding: 0 24px 16px; }
    .filter-form { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.08);
      display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .filter-group { display: flex; flex-direction: column; gap: 4px; }
    .filter-group label { font-size: .75rem; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: .04em; }
    .filter-group input, .filter-group select { padding: 7px 10px; border: 1px solid #ccc; border-radius: 6px;
      font-size: .875rem; min-width: 140px; }
    .filter-actions { display: flex; gap: 8px; }

    /* Toolbar */
    .toolbar { padding: 0 24px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .btn { padding: 8px 16px; background: #003087; color: #fff; border: none; border-radius: 6px;
      cursor: pointer; text-decoration: none; font-size: .875rem; white-space: nowrap; }
    .btn:hover { background: #0057c8; }
    .btn-ghost { background: transparent; color: #003087; border: 1px solid #003087; }
    .btn-ghost:hover { background: #f0f4fb; }
    .count { font-size: .875rem; color: #555; }
    .filter-active { font-size: .8rem; background: #fff3cd; color: #856404; padding: 4px 10px;
      border-radius: 20px; border: 1px solid #ffc107; }

    /* Table */
    .table-wrap { overflow-x: auto; padding: 0 24px 40px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px;
      overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    th { background: #003087; color: #fff; padding: 10px 12px; text-align: left;
      font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
    td { padding: 10px 12px; font-size: .875rem; border-bottom: 1px solid #eee; white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f0f4fb; }
    a { color: #003087; }
    .empty { text-align: center; padding: 40px; color: #888; white-space: normal; }

    /* Status */
    .status-sel { padding: 4px 8px; border-radius: 20px; border: 1px solid; font-size: .8rem;
      font-weight: 600; cursor: pointer; appearance: none; -webkit-appearance: none;
      padding-right: 20px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 6px center; }
    .status-sel:focus { outline: none; }
    .status-saving { opacity: .5; pointer-events: none; }
    .status-saved { animation: flash .4s ease; }
    @keyframes flash { 0%,100% { opacity:1 } 50% { opacity:.4 } }
  </style>
</head>
<body>
  <header>
    <h1>Brigade Electronics — Installation Records</h1>
    <span style="font-size:.85rem;opacity:.75">${new Date().toLocaleDateString('en-GB')}</span>
  </header>

  <!-- Stats -->
  <div class="stats-section">
    <h2>This Month</h2>
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${monthRows.length}</div>
        <div class="stat-label">Installs<br><span style="font-size:.7rem;opacity:.7">this month</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${allRows.length}</div>
        <div class="stat-label">Total<br><span style="font-size:.7rem;opacity:.7">all time</span></div>
      </div>
      ${productStatCards}
      ${topInstaller ? `
      <div class="stat-card" style="border-top-color:#6a3d9a">
        <div class="stat-value" style="color:#6a3d9a">${topInstaller[1]}</div>
        <div class="stat-label">${esc(topInstaller[0])}<br><span style="font-size:.7rem;opacity:.7">top installer</span></div>
      </div>` : ''}
    </div>
    <h2>Status Overview</h2>
    <div class="stats-row" style="margin-bottom:0">
      ${statusStatCards}
    </div>
  </div>

  <!-- Filter -->
  <div class="filter-section" style="padding-top:20px">
    <form class="filter-form" method="GET" action="/admin">
      <div class="filter-group">
        <label>From</label>
        <input type="date" name="date_from" value="${escAttr(date_from)}">
      </div>
      <div class="filter-group">
        <label>To</label>
        <input type="date" name="date_to" value="${escAttr(date_to)}">
      </div>
      <div class="filter-group">
        <label>Product</label>
        <select name="product_type">
          <option value="">All products</option>
          ${productOptions}
        </select>
      </div>
      <div class="filter-group">
        <label>Fleet / Company</label>
        <input type="text" name="fleet_company" value="${escAttr(fleet_company)}" placeholder="Any">
      </div>
      <div class="filter-group">
        <label>Installer</label>
        <input type="text" name="installer" value="${escAttr(installer)}" placeholder="Any">
      </div>
      <div class="filter-actions">
        <button type="submit" class="btn">Filter</button>
        ${isFiltered ? '<a class="btn btn-ghost" href="/admin">Clear</a>' : ''}
      </div>
    </form>
  </div>

  <!-- Toolbar -->
  <div class="toolbar" style="padding-top:16px">
    <a class="btn" href="/admin/export">⬇ Export CSV</a>
    <span class="count">${rows.length} submission${rows.length !== 1 ? 's' : ''}${isFiltered ? ' (filtered)' : ''}</span>
    ${isFiltered ? '<span class="filter-active">⚡ Filter active</span>' : ''}
  </div>

  <!-- Table -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Reference</th><th>Reg</th><th>VIN</th>
          <th>Vehicle</th><th>Colour</th><th>Fuel</th>
          <th>Product</th><th>SIM Number</th><th>Device ID</th><th>Camera</th>
          <th>Fleet/Company</th><th>Depot</th><th>Install Date</th>
          <th>Installer</th><th>Company</th><th>Mobile</th><th>Email</th>
          <th>Comments</th><th>Status</th><th>PDF</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? tableRows : '<tr><td colspan="21" class="empty">No submissions found.</td></tr>'}
      </tbody>
    </table>
  </div>

  <script>
    async function updateStatus(sel) {
      const id     = sel.dataset.id;
      const status = sel.value;
      sel.classList.add('status-saving');
      try {
        const r = await fetch('/admin/status/' + encodeURIComponent(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!r.ok) throw new Error();
        const meta = ${JSON.stringify(STATUS_META)};
        const m = meta[status];
        sel.style.color = m.colour;
        sel.style.background = m.bg;
        sel.style.borderColor = m.colour;
        sel.classList.add('status-saved');
        setTimeout(() => sel.classList.remove('status-saved'), 500);
      } catch {
        alert('Failed to update status. Please try again.');
        sel.value = sel.querySelector('[selected]')?.value || 'Pending';
      } finally {
        sel.classList.remove('status-saving');
      }
    }
  </script>
</body>
</html>`);
});

// ── POST /admin/status/:id ────────────────────────────────────────────────────
router.post('/status/:id', express.json(), async (req, res) => {
  const id = req.params.id.replace(/[^A-Z0-9-]/gi, '');
  const { status } = req.body;
  if (!STATUSES.includes(status))
    return res.status(400).json({ error: 'Invalid status.' });
  await db.updateStatus(id, status);
  res.json({ success: true });
});

// ── GET /admin/export ─────────────────────────────────────────────────────────
router.get('/export', (req, res) => {
  const rows = db.getAll();

  const headers = [
    'created_at', 'onboarding_id', 'status', 'product_type', 'sim_number', 'device_id',
    'camera', 'vehicle_registration', 'vin', 'fleet_company', 'depot',
    'installation_date', 'installer_name', 'installer_company',
    'installer_mobile', 'installer_email', 'comments',
    'vehicle_make', 'vehicle_model', 'vehicle_year', 'vehicle_colour', 'vehicle_fuel_type',
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
  const id  = req.params.id.replace(/[^A-Z0-9-]/gi, '');
  const row = db.getById(id);

  if (!row || !row.pdf_path)
    return res.status(404).send('PDF not found.');

  const safePath   = path.normalize(row.pdf_path);
  const uploadsRoot = path.resolve(
    process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads')
  );
  if (!safePath.startsWith(uploadsRoot))
    return res.status(403).send('Forbidden.');
  if (!fs.existsSync(safePath))
    return res.status(404).send('PDF file not found on disk.');

  res.download(safePath, `${id}_certificate.pdf`);
});

module.exports = router;
