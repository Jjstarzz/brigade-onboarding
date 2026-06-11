'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

if (!fs.existsSync(JOBS_FILE)) {
  fs.writeFileSync(JOBS_FILE, '[]', 'utf8');
}

let writeQueue = Promise.resolve();

function readAll() {
  try { return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); }
  catch { return []; }
}

function queueWrite(fn) {
  writeQueue = writeQueue.then(fn).catch((err) =>
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'Jobs DB write error', error: err.message }))
  );
  return writeQueue;
}

function generateRef() {
  const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `JOB-${today}-`;
  const count  = readAll().filter((j) => (j.ref || '').startsWith(prefix)).length;
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

function insert(record) {
  return queueWrite(() => {
    const jobs = readAll();
    jobs.unshift({ ...record, created_at: new Date().toISOString() });
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  });
}

function getAll()      { return readAll(); }
function getByRef(ref) { return readAll().find((j) => j.ref === ref); }

module.exports = { insert, getAll, getByRef, generateRef };
