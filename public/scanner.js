(function () {
  const FORMATS = ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code',
                   'data_matrix', 'code_93', 'itf', 'pdf417', 'upc_a', 'upc_e'];

  window.openScanner = async function (fieldId) {
    triggerCapture(fieldId);
  };

  function triggerCapture(fieldId) {
    const input   = document.createElement('input');
    input.type    = 'file';
    input.accept  = 'image/*';
    input.capture = 'environment';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await decode(file);
        fillField(fieldId, text);
      } catch (_) {
        // Non-blocking retry prompt — cleaner than alert()
        const retry = confirm(
          'No barcode detected.\n\n' +
          'Tips:\n' +
          '• Hold phone in landscape (sideways)\n' +
          '• Get as close as possible — barcode should fill the frame\n' +
          '• Ensure good lighting, no shadows\n\n' +
          'Try again?'
        );
        if (retry) triggerCapture(fieldId);
      }
    };

    input.click();
  }

  async function decode(file) {
    const original   = await fileToCanvas(file);
    const enhanced   = enhanceCanvas(original);

    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: FORMATS });

      // Try original + enhanced, each at 4 rotations
      for (const src of [original, enhanced]) {
        for (const deg of [0, 90, 180, 270]) {
          const c = deg === 0 ? src : rotateCanvas(src, deg);
          const r = await detector.detect(c);
          if (r.length) return r[0].rawValue;
        }
      }
    }

    // Final fallback
    await loadHtml5();
    return await Html5Qrcode.scanFile(file, false);
  }

  // Draw via <img> so browser applies EXIF orientation
  function fileToCanvas(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const c   = document.createElement('canvas');
        c.width   = img.naturalWidth;
        c.height  = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // Greyscale + contrast boost — helps thin/low-contrast barcodes
  function enhanceCanvas(src) {
    const c   = document.createElement('canvas');
    c.width   = src.width;
    c.height  = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const id  = ctx.getImageData(0, 0, c.width, c.height);
    const d   = id.data;
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Stretch contrast
      g = g < 128 ? Math.max(0, g * 0.6) : Math.min(255, 100 + g * 0.6);
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  function rotateCanvas(src, deg) {
    const c   = document.createElement('canvas');
    const rad = deg * Math.PI / 180;
    if (deg === 90 || deg === 270) { c.width = src.height; c.height = src.width; }
    else                           { c.width = src.width;  c.height = src.height; }
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  function fillField(fieldId, raw) {
    const el = document.getElementById(fieldId);
    if (el) {
      el.value = raw.trim().toUpperCase();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function loadHtml5() {
    return new Promise((resolve, reject) => {
      if (window.Html5Qrcode) { resolve(); return; }
      const s   = document.createElement('script');
      s.src     = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Failed to load scanner library'));
      document.head.appendChild(s);
    });
  }
})();
