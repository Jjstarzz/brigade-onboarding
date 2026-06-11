'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const TOTAL_PAGES = 6;

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
  6: [], // all optional
};

// ── State ──────────────────────────────────────────────────────────────────────
let currentPage = 1;
let cameraValue = '';
let channelCount = 0;
let sigPad       = null;
let workPhotos   = [];
let jobParts     = [];

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  populateChannelDropdowns();
  initPhotoUploads();
  initSignaturePad();
  initWorkPhotos();
  initPartsTable();
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

// ── Signature pad ─────────────────────────────────────────────────────────────
function initSignaturePad() {
  const canvas  = document.getElementById('sig-canvas-main');
  if (!canvas || typeof SignaturePad === 'undefined') return;
  const wrapper = document.getElementById('sig-wrapper-main');

  function resize() {
    const ratio   = window.devicePixelRatio || 1;
    canvas.width  = wrapper.offsetWidth * ratio;
    canvas.height = 130 * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    if (sigPad) sigPad.clear();
  }

  sigPad = new SignaturePad(canvas, { penColor: '#003087', minWidth: 1.5, maxWidth: 3 });
  resize();
  window.addEventListener('resize', resize);

  document.getElementById('sig-clear-btn').addEventListener('click', () => sigPad.clear());
}

// ── Work photos ───────────────────────────────────────────────────────────────
function initWorkPhotos() {
  const input = document.getElementById('work-photos-input');
  if (!input) return;
  input.addEventListener('change', (e) => {
    for (const f of Array.from(e.target.files)) {
      if (workPhotos.length >= 5) break;
      workPhotos.push(f);
    }
    input.value = '';
    renderWorkPhotos();
  });
}

function renderWorkPhotos() {
  const grid  = document.getElementById('work-photo-previews');
  const count = document.getElementById('work-photo-count');
  if (!grid) return;
  grid.innerHTML = '';
  workPhotos.forEach((f, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'work-photo-thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.alt = f.name;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'remove-work-photo';
    rm.innerHTML = '&#215;';
    rm.addEventListener('click', () => {
      URL.revokeObjectURL(img.src);
      workPhotos.splice(i, 1);
      renderWorkPhotos();
    });
    thumb.appendChild(img); thumb.appendChild(rm);
    grid.appendChild(thumb);
  });
  if (count) count.textContent = workPhotos.length
    ? `${workPhotos.length} of 5 photo${workPhotos.length !== 1 ? 's' : ''} added` : '';
}

// ── Parts table ───────────────────────────────────────────────────────────────
function initPartsTable() {
  const btn = document.getElementById('add-part-btn-main');
  if (!btn) return;
  btn.addEventListener('click', () => {
    jobParts.push({ name: '', quantity: 1 });
    renderParts();
    const inputs = document.querySelectorAll('.part-name-main');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
}

function renderParts() {
  const list   = document.getElementById('parts-list-main');
  const header = document.getElementById('parts-header-main');
  if (!list) return;
  header.style.display = jobParts.length ? 'grid' : 'none';
  list.innerHTML = '';
  jobParts.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'parts-row';
    row.innerHTML = `
      <input type="text"   class="part-name-main" placeholder="Part / description" value="${escHtml(p.name)}" data-i="${i}">
      <input type="number" class="part-qty-main"  placeholder="Qty" min="1" value="${p.quantity || 1}" data-i="${i}">
      <button type="button" class="remove-part-row" data-i="${i}" aria-label="Remove">&#215;</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll('.part-name-main').forEach((el) =>
    el.addEventListener('input', (e) => { jobParts[+e.target.dataset.i].name = e.target.value; syncParts(); }));
  list.querySelectorAll('.part-qty-main').forEach((el) =>
    el.addEventListener('input', (e) => { jobParts[+e.target.dataset.i].quantity = +e.target.value || 1; syncParts(); }));
  list.querySelectorAll('.remove-part-row').forEach((el) =>
    el.addEventListener('click', (e) => { jobParts.splice(+e.target.dataset.i, 1); renderParts(); syncParts(); }));
  syncParts();
}

function syncParts() {
  const el = document.getElementById('parts_used');
  if (el) el.value = JSON.stringify(jobParts);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Submit ─────────────────────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  if (!validatePage(6)) return;

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
    if (!navigator.onLine)
      throw new Error('You appear to be offline. Please check your connection and try again.');

    // Capture signature before building FormData
    if (sigPad && !sigPad.isEmpty()) {
      document.getElementById('signature').value = sigPad.toDataURL('image/png');
    }

    const formData = new FormData(formEl);
    formData.set('vehicle_registration',
      (formData.get('vehicle_registration') || '').toUpperCase().replace(/\s/g, ''));
    formData.set('vin',
      (formData.get('vin') || '').toUpperCase().replace(/\s/g, ''));

    // Remove file input placeholder; append actual work photo File objects
    formData.delete('work_photos');
    workPhotos.forEach((f) => formData.append('work_photos', f));

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

// ── PWA Install prompt ─────────────────────────────────────────────────────────
(function () {
  const banner  = document.getElementById('install-banner');
  const btn     = document.getElementById('install-btn');
  const dismiss = document.getElementById('install-dismiss');
  const sub     = document.getElementById('install-banner-sub');

  // Don't show if already running as installed PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIos) {
    // iOS doesn't fire beforeinstallprompt — show a manual hint instead
    sub.textContent = 'Tap the Share button \u{1F4E4} then "Add to Home Screen".';
    btn.style.display = 'none';
    banner.classList.add('visible');
  } else {
    // Android / Chrome — wait for the native prompt
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      banner.classList.add('visible');
    });

    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') banner.classList.remove('visible');
      deferredPrompt = null;
    });

    window.addEventListener('appinstalled', () => banner.classList.remove('visible'));
  }

  dismiss.addEventListener('click', () => banner.classList.remove('visible'));
}());

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

  // Reset job sheet state
  if (sigPad) sigPad.clear();
  document.getElementById('signature').value = '';
  workPhotos.forEach((f) => { try { URL.revokeObjectURL(f); } catch (_) {} });
  workPhotos = [];
  renderWorkPhotos();
  jobParts = [];
  renderParts();

  setDefaultDate();
  goTo(1);
}
