'use strict';

/**
 * Simple file-based store.
 *
 * Submissions are kept in  data/submissions.json  as a JSON array.
 * No native modules, no compilation — works on any platform out of the box.
 *
 * Writes are serialised via a simple in-memory queue so concurrent requests
 * never corrupt the file.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'submissions.json');

// Initialise file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, '[]', 'utf8');
}

// ── Serialised write queue ─────────────────────────────────────────────────────
let writeQueue = Promise.resolve();

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function queueWrite(fn) {
  writeQueue = writeQueue.then(fn).catch((err) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'DB write error', error: err.message }));
  });
  return writeQueue;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Insert a new submission record.
 * @param {Object} record
 */
function insert(record) {
  return queueWrite(() => {
    const rows = readAll();
    rows.unshift({ ...record, created_at: new Date().toISOString() });
    fs.writeFileSync(DB_FILE, JSON.stringify(rows, null, 2), 'utf8');
  });
}

/**
 * Update the pdf_path for an existing record.
 * @param {string} onboardingId
 * @param {string} pdfPath
 */
function updatePdfPath(onboardingId, pdfPath) {
  return queueWrite(() => {
    const rows = readAll();
    const row  = rows.find((r) => r.onboarding_id === onboardingId);
    if (row) row.pdf_path = pdfPath;
    fs.writeFileSync(DB_FILE, JSON.stringify(rows, null, 2), 'utf8');
  });
}

/**
 * Return all submissions newest-first.
 * @returns {Array}
 */
function getAll() {
  return readAll();
}

/**
 * Return a single submission by onboarding ID.
 * @param {string} onboardingId
 * @returns {Object|undefined}
 */
function getById(onboardingId) {
  return readAll().find((r) => r.onboarding_id === onboardingId);
}

/**
 * Update the status for an existing record.
 * @param {string} onboardingId
 * @param {string} status  'Pending' | 'Reviewed' | 'Approved' | 'Flagged'
 */
function updateStatus(onboardingId, status) {
  return queueWrite(() => {
    const rows = readAll();
    const row  = rows.find((r) => r.onboarding_id === onboardingId);
    if (row) row.status = status;
    fs.writeFileSync(DB_FILE, JSON.stringify(rows, null, 2), 'utf8');
  });
}

module.exports = { insert, updatePdfPath, getAll, getById, updateStatus };
