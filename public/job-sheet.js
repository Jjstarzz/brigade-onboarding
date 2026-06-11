(function () {
  'use strict';

  // ── Signature pad ──────────────────────────────────────────────────────────
  let sigPad = null;

  function initSigPad() {
    const canvas  = document.getElementById('sig-canvas');
    const wrapper = canvas.parentElement;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      canvas.width  = wrapper.offsetWidth  * ratio;
      canvas.height = 140 * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      if (sigPad) sigPad.clear();
    }

    sigPad = new SignaturePad(canvas, { penColor: '#003087', minWidth: 1.5, maxWidth: 3 });
    resize();
    window.addEventListener('resize', resize);

    document.getElementById('sig-clear').addEventListener('click', () => {
      sigPad.clear();
      document.getElementById('sig-error').style.display = 'none';
    });
  }

  // ── Parts table ───────────────────────────────────────────────────────────
  let parts = [];

  function renderParts() {
    const list   = document.getElementById('parts-list');
    const header = document.getElementById('parts-header');
    header.style.display = parts.length ? 'grid' : 'none';
    list.innerHTML = '';
    parts.forEach((p, i) => {
      const row     = document.createElement('div');
      row.className = 'parts-row';
      row.innerHTML = `
        <input type="text"   class="part-name" placeholder="Part / description" value="${esc(p.name)}" data-i="${i}">
        <input type="number" class="part-qty"  placeholder="Qty" min="1" value="${p.quantity || 1}" data-i="${i}">
        <button type="button" class="remove-part" data-i="${i}" aria-label="Remove">&#215;</button>`;
      list.appendChild(row);
    });

    list.querySelectorAll('.part-name').forEach((el) =>
      el.addEventListener('input', (e) => { parts[+e.target.dataset.i].name = e.target.value; syncParts(); }));
    list.querySelectorAll('.part-qty').forEach((el) =>
      el.addEventListener('input', (e) => { parts[+e.target.dataset.i].quantity = +e.target.value || 1; syncParts(); }));
    list.querySelectorAll('.remove-part').forEach((el) =>
      el.addEventListener('click', (e) => { parts.splice(+e.target.dataset.i, 1); renderParts(); syncParts(); }));
  }

  function syncParts() {
    document.getElementById('parts_used').value = JSON.stringify(parts);
  }

  document.getElementById('add-part-btn').addEventListener('click', () => {
    parts.push({ name: '', quantity: 1 });
    renderParts();
    syncParts();
    const inputs = document.querySelectorAll('.part-name');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  // ── Photo handling ────────────────────────────────────────────────────────
  const MAX_PHOTOS  = 5;
  let photoFiles    = [];

  const photosInput = document.getElementById('photos-input');
  photosInput.addEventListener('change', (e) => {
    const incoming = Array.from(e.target.files);
    for (const f of incoming) {
      if (photoFiles.length >= MAX_PHOTOS) break;
      photoFiles.push(f);
    }
    photosInput.value = '';
    renderPhotos();
  });

  function renderPhotos() {
    const grid  = document.getElementById('photo-previews');
    const count = document.getElementById('photo-count');
    grid.innerHTML = '';
    photoFiles.forEach((f, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.alt = f.name;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove-photo';
      rm.innerHTML = '&#215;';
      rm.addEventListener('click', () => {
        URL.revokeObjectURL(img.src);
        photoFiles.splice(i, 1);
        renderPhotos();
      });
      thumb.appendChild(img);
      thumb.appendChild(rm);
      grid.appendChild(thumb);
    });
    count.textContent = photoFiles.length
      ? `${photoFiles.length} of ${MAX_PHOTOS} photo${photoFiles.length !== 1 ? 's' : ''} added`
      : '';
  }

  // ── Form submit ───────────────────────────────────────────────────────────
  document.getElementById('job-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const form      = e.target;
    const submitBtn = document.getElementById('submit-btn');
    const errBanner = document.getElementById('form-error');
    const sigError  = document.getElementById('sig-error');

    // Validate HTML5 fields
    if (!form.checkValidity()) {
      form.querySelectorAll(':invalid')[0]?.focus();
      return;
    }

    // Validate signature
    if (!sigPad || sigPad.isEmpty()) {
      sigError.style.display = 'block';
      sigError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    sigError.style.display = 'none';

    // Capture signature as PNG data URL
    document.getElementById('signature').value = sigPad.toDataURL('image/png');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    errBanner.style.display = 'none';

    try {
      const fd = new FormData(form);
      // Remove the unused file input (photos handled manually)
      fd.delete('photos-input');
      // Append actual photo files
      photoFiles.forEach((f) => fd.append('photos', f));

      const res  = await fetch('/api/jobs', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed. Please try again.');

      document.getElementById('success-ref').textContent = data.ref;
      document.getElementById('success-screen').classList.add('visible');
    } catch (err) {
      errBanner.textContent = err.message;
      errBanner.style.display = 'block';
      errBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Job Sheet';
    }
  });

  // ── Reset after success ───────────────────────────────────────────────────
  window.resetForm = function () {
    document.getElementById('success-screen').classList.remove('visible');
    document.getElementById('job-form').reset();
    parts = [];
    renderParts();
    syncParts();
    photoFiles.forEach((f) => URL.revokeObjectURL(f));
    photoFiles = [];
    renderPhotos();
    if (sigPad) sigPad.clear();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSigPad);
  } else {
    initSigPad();
  }

  // Pre-fill today's date
  const dateInput = document.getElementById('date_of_attendance');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
})();
