(function () {
  const FORMATS = ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code',
                   'data_matrix', 'code_93', 'itf', 'pdf417', 'upc_a', 'upc_e'];

  window.openScanner = async function (fieldId) {
    const input = document.createElement('input');
    input.type    = 'file';
    input.accept  = 'image/*';
    input.capture = 'environment';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const bitmap = await createImageBitmap(file);

        if ('BarcodeDetector' in window) {
          const detector = new BarcodeDetector({ formats: FORMATS });
          const results  = await detector.detect(bitmap);
          bitmap.close();
          if (results.length) { fillField(fieldId, results[0].rawValue); return; }
        } else {
          bitmap.close();
        }

        // Fallback: try html5-qrcode if BarcodeDetector missed it or unavailable
        await loadHtml5();
        const text = await Html5Qrcode.scanFile(file, false);
        fillField(fieldId, text);

      } catch (_) {
        alert('No barcode detected. Make sure the barcode fills the frame, is in focus, and well-lit.');
      }
    };

    input.click();
  };

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
      const s = document.createElement('script');
      s.src    = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Failed to load scanner library'));
      document.head.appendChild(s);
    });
  }
})();
