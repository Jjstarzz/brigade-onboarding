'use strict';

/**
 * OCR Service — Tesseract.js
 *
 * Runs OCR on each uploaded image in parallel.
 * Returns a map of { fieldName: { text, confidence, patterns } }
 *
 * patterns:
 *   regPlate — UK registration plate (e.g. "AB12 CDE")
 *   vin       — 17-character VIN number
 *
 * Only includes results where confidence >= MIN_CONFIDENCE and
 * the extracted text is non-empty after cleaning.
 */

const { createWorker } = require('tesseract.js');
const fs               = require('fs');

const MIN_CONFIDENCE = 40; // below this threshold, don't surface the text

// UK reg plate: two letters, two digits, optional space, three letters
const RE_REG = /\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/i;
// VIN: exactly 17 uppercase alphanumeric chars (no I, O, Q)
const RE_VIN = /\b([A-HJ-NPR-Z0-9]{17})\b/;

/**
 * Run OCR on a single image file.
 * Returns null if the file is missing, unreadable, or confidence is too low.
 */
async function recognise(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;

  let worker;
  try {
    worker = await createWorker('eng', 1, {
      // suppress verbose Tesseract logs
      logger: () => {},
      errorHandler: () => {},
    });

    const { data } = await worker.recognize(filePath);
    const text       = (data.text || '').trim();
    const confidence = data.confidence || 0;

    if (!text || confidence < MIN_CONFIDENCE) return null;

    // Clean up whitespace while preserving newlines
    const cleaned = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    // Detect structured patterns
    const regMatch = cleaned.match(RE_REG);
    const vinMatch = cleaned.match(RE_VIN);

    return {
      text:       cleaned,
      confidence: Math.round(confidence),
      patterns: {
        regPlate: regMatch ? regMatch[1].toUpperCase() : null,
        vin:      vinMatch ? vinMatch[1].toUpperCase() : null,
      },
    };
  } catch (err) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(), level: 'warn',
      msg: 'OCR failed for image', file: filePath, error: err.message,
    }));
    return null;
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch (_) {}
    }
  }
}

/**
 * Run OCR on all photos in parallel.
 *
 * @param {Object} photoPaths  { fieldName: '/path/to/file.jpg' }
 * @returns {Object}           { fieldName: { text, confidence, patterns } | null }
 */
async function runOcr(photoPaths) {
  const entries = Object.entries(photoPaths).filter(([, p]) => p);

  const results = await Promise.all(
    entries.map(async ([field, filePath]) => {
      const result = await recognise(filePath);
      return [field, result];
    })
  );

  return Object.fromEntries(results);
}

module.exports = { runOcr };
