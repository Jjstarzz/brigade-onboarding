'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const TOTAL_PAGES = 5;

const CHANNEL_OPTIONS = [
  'Front', 'Rear', 'Driver Facing', 'Left Side', 'Right Side',
  'Cabin Interior', 'Nearside', 'Offside', 'Reversing', 'Not Used',
];

const PHOTO_FIELDS = [
  'system_photo', 'network_photo', 'server_photo',
  'registration_photo', 'vin_photo',
];

// Validation patterns — mirror server-side rules exactly
const VALIDATORS = {
  product_type:         (v) => v !== '',
  sim_number:           (v) => /^\d{19}$/.test(v),
  device_id:            (v) => /^[A-Za-z0-9_-]{1,50}$/.test(v),
  vehicle_registration: (v) => v.trim().length > 0 && v.trim().length <= 15,
  vin:                  (v) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v.toUpperCase()),
  camera:               (v) => v === 'Yes' || v === 'No',
  fleet_company:        (v) => v.trim().length > 0 && v.trim().length <= 200,
  depot:                (v) => v.trim().length > 0 && v.trim().length <= 200,
  installation_date:    (v) => v !== '' && !isNaN(Date.parse(v)),
  installer_name:       (v) => v.trim().length > 0 && v.trim().length <= 100,
  installer_company:    (v) => v.trim().length > 0 && v.trim().length <= 200,
  installer_mobile:     (v) => /^[0-9 +\-()]{7,20}$/.test(v.trim()),
  installer_email:      (v) => /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(v.trim()),
};

const ERROR_MESSAGES = {
  product_type:         'Please select a product type.',
  sim_number:           'SIM Number must be exactly 19 digits.',
  device_id:            'Device ID must be 1–50 alphanumeric characters.',
  vehicle_registration: 'Vehicle registration is required (max 15 characters).',
  vin:                  'VIN must be exactly 17 characters (A–Z, 0–9, no I/O/Q).',
  camera:               'Please select Yes or No for camera.',
  fleet_company:        'Fleet/Company Name is required.',
  depot:                'Depot is required.',
  installation_date:    'Please enter a valid installation date.',
  installer_name:       'Installer Name is required.',
  installer_company:    'Installer Company is required.',
  installer_mobile:     'Enter a valid phone number (7–20 digits).',
  installer_email:      'Enter a valid email address.',
};

const PAGE_FIELDS = {
  1: ['product_type', 'sim_number', 'device_id', 'camera'],
  2: ['vehicle_registration', 'vin'],
  3: PHOTO_FIELDS,
  4: ['fleet_company', 'depot', 'installation_date'],
  5: ['installer_name', 'installer_company', 'installer_mobile', 'installer_email'],
};

// ── State ──────────────────────────────────────────────────────────────────────
let currentPage = 1;
let cameraValue = '';
let channelCount = 0;

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  populateChannelDropdowns();
  initPhotoUploads();
  setDefaultDate();
  document.getElementById('onboarding-form').addEventListener('submit', handleSubmit);
  goTo(1);
});

function setDefaultDate() {
  document.getElementById('installation_date').value = new Date().toISOString().slice(0, 10);
}

// ── Channel dropdowns ──────────────────────────────────────────────────────────
function populateChannelDropdowns() {
  for (let i = 1; i <= 9; i++) {
    const sel = document.getElementById(`channel_${i}`);
    if (!sel) continue;
    CHANNEL_OPTIONS.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      sel.appendChild(o);
    });
  }
}

// ── Camera toggle ──────────────────────────────────────────────────────────────
function setCamera(value) {
  cameraValue = value;
  document.getElementById('camera').value = value;
  document.getElementById('camera-yes').className = 'toggle-btn' + (value === 'Yes' ? ' selected-yes' : '');
  document.getElementById('camera-no').className  = 'toggle-btn' + (value === 'No'  ? ' selected-no'  : '');
  document.getElementById('camera-channels').classList.toggle('visible', value === 'Yes');
  if (value !== 'Yes') {
    channelCount = 0;
    document.getElementById('channel_count').value = '';
    document.getElementById('camera-channels-grid').style.display = 'none';
    for (let i = 1; i <= 9; i++) clearError(`channel_${i}`);
    clearError('channel_count');
  }
  clearError('camera');
}

function setChannelCount(n) {
  channelCount = parseInt(n, 10) || 0;
  const grid = document.getElementById('camera-channels-grid');
  grid.style.display = channelCount > 0 ? 'grid' : 'none';
  for (let i = 1; i <= 9; i++) {
    const group = document.getElementById(`group-channel_${i}`);
    if (group) group.style.display = i <= channelCount ? '' : 'none';
    if (i > channelCount) clearError(`channel_${i}`);
  }
  clearError('channel_count');
}

// ── Photo upload previews ──────────────────────────────────────────────────────
function initPhotoUploads() {
  PHOTO_FIELDS.forEach((field) => {
    const input = document.getElementById(field);
    if (!input) return;
    input.addEventListener('change', () => handleFileSelect(field, input));

    const area = document.getElementById(`ua-${field}`);
    if (!area) return;
    area.addEventListener('dragover',  (e) => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', ()  => area.classList.remove('drag-over'));
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('drag-over');
      if (e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        handleFileSelect(field, input);
      }
    });
  });
}

function handleFileSelect(field, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showError(field, 'File exceeds 10 MB. Please choose a smaller image.');
    input.value = '';
    return;
  }
  const area = document.getElementById(`ua-${field}`);
  area.classList.add('has-file');
  document.getElementById(`fn-${field}`).textContent = file.name;
  const prev = document.getElementById(`prev-${field}`);
  const reader = new FileReader();
  reader.onload = (e) => { prev.src = e.target.result; };
  reader.readAsDataURL(file);
  clearError(field);
}

// ── Navigation ─────────────────────────────────────────────────────────────────
function goTo(target) {
  if (target > currentPage && !validatePage(currentPage)) return;

  for (let i = 1; i <= TOTAL_PAGES; i++) {
    document.getElementById(`page-${i}`).classList.remove('active');
    const ind = document.getElementById(`step-${i}-ind`);
    ind.classList.toggle('done',   i < target);
    ind.classList.toggle('active', i === target);
    if (i >= target) ind.classList.remove('done');
  }

  document.getElementById(`page-${target}`).classList.add('active');
  currentPage = target;
  clearAlert();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Validation ─────────────────────────────────────────────────────────────────
function validatePage(page) {
  let valid = true;

  for (const field of (PAGE_FIELDS[page] || [])) {
    if (PHOTO_FIELDS.includes(field)) {
      // Photos are optional — skip validation
      continue;
    }
    const el = document.getElementById(field);
    if (!el) continue;
    const val = el.value || '';
    if (VALIDATORS[field] && !VALIDATORS[field](val)) {
      showError(field, ERROR_MESSAGES[field] || `${field} is invalid.`);
      valid = false;
    } else {
      clearError(field);
      if (el.type !== 'hidden') el.classList.add('valid');
    }
  }

  // Channel validation on page 1
  if (page === 1 && cameraValue === 'Yes') {
    if (!channelCount) {
      showError('channel_count', 'Please select the number of channels.');
      valid = false;
    } else {
      clearError('channel_count');
      for (let i = 1; i <= channelCount; i++) {
        const sel = document.getElementById(`channel_${i}`);
        if (!sel?.value) {
          showError(`channel_${i}`, `Channel ${i} is required.`);
          valid = false;
        } else {
          clearError(`channel_${i}`);
        }
      }
    }
  }

  if (!valid) {
    showAlert('Please fix the errors highlighted below before continuing.');
    document.querySelector('.field-error.visible')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return valid;
}

function showError(field, msg) {
  const e = document.getElementById(`err-${field}`);
  const i = document.getElementById(field);
  if (e) { e.textContent = msg; e.classList.add('visible'); }
  if (i) { i.classList.add('invalid'); i.classList.remove('valid'); }
}

function clearError(field) {
  const e = document.getElementById(`err-${field}`);
  const i = document.getElementById(field);
  if (e) { e.textContent = ''; e.classList.remove('visible'); }
  if (i) i.classList.remove('invalid');
}

function showAlert(msg) {
  const el = document.getElementById('alert-error');
  el.textContent = msg; el.classList.add('visible');
}

function clearAlert() {
  const el = document.getElementById('alert-error');
  el.textContent = ''; el.classList.remove('visible');
}

// ── Submit ─────────────────────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  if (!validatePage(5)) return;

  const formEl    = document.getElementById('onboarding-form');
  const spinner   = document.getElementById('spinner');
  const spinMsg   = document.getElementById('spinner-msg');
  const submitBtn = document.getElementById('submit-btn');

  submitBtn.disabled = true;
  spinner.classList.add('visible');

  const messages = [
    'Uploading photos…',
    'Saving installation record…',
    'Generating PDF certificate…',
    'Sending confirmation email…',
  ];
  let idx = 0;
  spinMsg.textContent = messages[0];
  const ticker = setInterval(() => { spinMsg.textContent = messages[++idx % messages.length]; }, 3500);

  try {
    const formData = new FormData(formEl);
    formData.set('vehicle_registration',
      (formData.get('vehicle_registration') || '').toUpperCase().replace(/\s/g, ''));
    formData.set('vin',
      (formData.get('vin') || '').toUpperCase().replace(/\s/g, ''));

    const res  = await fetch('/api/submit', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed. Please try again.');

    clearInterval(ticker);
    spinner.classList.remove('visible');
    formEl.style.display = 'none';
    document.getElementById('progress-bar').style.display = 'none';
    document.getElementById('success-ref').textContent = data.onboardingId;
    document.getElementById('success-screen').classList.add('visible');

  } catch (err) {
    clearInterval(ticker);
    spinner.classList.remove('visible');
    submitBtn.disabled = false;
    showAlert(err.message || 'An unexpected error occurred. Please try again.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ── Reset ──────────────────────────────────────────────────────────────────────
function resetForm() {
  const formEl = document.getElementById('onboarding-form');
  formEl.reset();
  formEl.style.display = 'block';
  document.getElementById('progress-bar').style.display = 'flex';
  document.getElementById('success-screen').classList.remove('visible');
  document.getElementById('alert-error').classList.remove('visible');
  document.getElementById('submit-btn').disabled = false;
  document.getElementById('camera-channels').classList.remove('visible');
  document.getElementById('camera-channels-grid').style.display = 'none';
  document.getElementById('camera').value = '';
  document.getElementById('channel_count').value = '';
  document.getElementById('camera-yes').className = 'toggle-btn';
  document.getElementById('camera-no').className  = 'toggle-btn';
  cameraValue = '';
  channelCount = 0;

  PHOTO_FIELDS.forEach((field) => {
    document.getElementById(`ua-${field}`)?.classList.remove('has-file');
    const prev = document.getElementById(`prev-${field}`);
    if (prev) prev.src = '';
    const fn = document.getElementById(`fn-${field}`);
    if (fn) fn.textContent = '';
    clearError(field);
  });

  document.querySelectorAll('.valid, .invalid').forEach((el) => {
    el.classList.remove('valid', 'invalid');
  });

  setDefaultDate();
  goTo(1);
}
