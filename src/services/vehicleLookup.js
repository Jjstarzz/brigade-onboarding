'use strict';

/**
 * Vehicle lookup service.
 *
 * Tries APIs in order until one succeeds:
 *   1. DVLA Vehicle Enquiry API  — UK primary (needs DVLA_API_KEY)
 *   2. NHTSA VIN Decoder         — public fallback, no key needed
 *
 * Always resolves — never throws — so a failed lookup never blocks a submission.
 */

const axios = require('axios');

const TIMEOUT = 8000; // 8 seconds per API call

/**
 * @typedef  {Object} VehicleInfo
 * @property {string} make
 * @property {string} model
 * @property {string} year
 * @property {string} colour
 * @property {string} fuelType
 * @property {string} source   — 'DVLA' | 'NHTSA' | 'NOT_FOUND'
 */

/**
 * Look up a vehicle by registration and/or VIN.
 * @param {string} registration  UK plate, no spaces, uppercase
 * @param {string} vin           17-char VIN
 * @returns {Promise<VehicleInfo>}
 */
async function lookupVehicle(registration, vin) {
  // 1 — DVLA (UK)
  if (registration && process.env.DVLA_API_KEY) {
    try {
      const info = await dvlaLookup(registration);
      console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'DVLA lookup succeeded', registration }));
      return info;
    } catch (err) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'DVLA lookup failed, trying NHTSA', error: err.message }));
    }
  }

  // 2 — NHTSA VIN decoder (public, no key required)
  if (vin) {
    try {
      const info = await nhtsaLookup(vin);
      console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'NHTSA lookup succeeded', vin }));
      return info;
    } catch (err) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'NHTSA lookup failed', error: err.message }));
    }
  }

  // All lookups failed — return empty but valid object so submission continues
  return { make: '', model: '', year: '', colour: '', fuelType: '', source: 'NOT_FOUND' };
}

// ── DVLA ──────────────────────────────────────────────────────────────────────
async function dvlaLookup(registrationNumber) {
  const { data } = await axios.post(
    'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
    { registrationNumber },
    {
      headers: {
        'x-api-key': process.env.DVLA_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT,
    }
  );

  return {
    make:     data.make                  || '',
    model:    '',                               // DVLA doesn't return model
    year:     String(data.yearOfManufacture || ''),
    colour:   data.colour                || '',
    fuelType: data.fuelType              || '',
    source:   'DVLA',
  };
}

// ── NHTSA VIN decoder (public) ────────────────────────────────────────────────
async function nhtsaLookup(vin) {
  const { data } = await axios.get(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(vin)}`,
    { params: { format: 'json' }, timeout: TIMEOUT }
  );

  const find = (variable) =>
    data.Results?.find((r) => r.Variable === variable)?.Value || '';

  const make = find('Make');
  if (!make) throw new Error('No data returned from NHTSA');

  return {
    make,
    model:    find('Model'),
    year:     find('Model Year'),
    colour:   '',
    fuelType: find('Fuel Type - Primary'),
    source:   'NHTSA',
  };
}

module.exports = { lookupVehicle };
