'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const crypto  = require('crypto');

// ── Validate required env vars before anything else ───────────────────────────
const REQUIRED = ['SENDGRID_API_KEY', 'EMAIL_RECIPIENTS', 'ADMIN_PASSWORD'];
const missing  = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

const submitRoute = require('./routes/submit');
const adminRoute  = require('./routes/admin');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ── Correlation ID (for log tracing) ─────────────────────────────────────────
app.use((req, res, next) => {
  req.correlationId = crypto.randomUUID();
  res.setHeader('X-Correlation-Id', req.correlationId);
  next();
});

// ── Simple request logger ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: req.ip,
    }));
  });
  next();
});

// ── Parsers ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use('/api/submit', submitRoute);
app.use('/admin', adminRoute);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, error: 'Not found.' }));

// ── Central error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;

  // Multer limits
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ success: false, error: 'File exceeds 10 MB limit.' });
  if (err.code === 'LIMIT_UNEXPECTED_FILE')
    return res.status(400).json({ success: false, error: 'Unexpected file field.' });

  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error',
    correlationId: req.correlationId, status, message: err.message }));

  const msg = (status === 400)
    ? err.message
    : (process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message);

  res.status(status).json({ success: false, error: msg, correlationId: req.correlationId });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = app.listen(PORT, () =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'Server started', port: PORT }))
);

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));

module.exports = app;
