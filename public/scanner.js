(function () {
  const FORMATS = ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code',
                   'data_matrix', 'code_93', 'itf', 'pdf417', 'upc_a', 'upc_e'];

  window.openScanner = async function (fieldId) {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = 'image/*';
    input.capture  = 'environment';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await decode(file);
        fillField(fieldId, text);
      } catch (err) {
        alert('No barcode detected. Point the camera closer so the barcode fills the frame, and make sure it is well-lit.');
      }
    };

    input.click();
  };

  async function decode(file) {
    // Draw image via <img> tag — this respects EXIF rotation on Android
    const canvas = await fileToCanvas(file);

    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: FORMATS });
      const results  = await detector.detect(canvas);
      if (results.length) return results[0].rawValue;

      // Retry at 90° intervals in case EXIF rotation wasn't applied
      for (const angle of [90, 180, 270]) {
        const rotated = rotateCanvas(canvas, angle);
        const r = await detector.detect(rotated);
        if (r.length) return r[0].rawValue;
      }
    }

    // Final fallback — html5-qrcode
    await loadHtml5();
    return await Html5Qrcode.scanFile(file, false);
  }

  // Draw image to canvas using <img> (browser applies EXIF orientation via CSS/rendering)
  function fileToCanvas(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width  = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function rotateCanvas(src, degrees) {
    const c   = document.createElement('canvas');
    const rad = degrees * Math.PI / 180;
    if (degrees === 90 || degrees === 270) {
      c.width  = src.height;
      c.height = src.width;
    } else {
      c.width  = src.width;
      c.height = src.height;
    }
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
