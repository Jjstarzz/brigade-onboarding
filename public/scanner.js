(function () {
  window.openScanner = async function (fieldId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        await loadLib();
        const text = await Html5Qrcode.scanFile(file, true);
        const el = document.getElementById(fieldId);
        if (el) {
          el.value = text.trim().toUpperCase();
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (_) {
        alert('No barcode detected. Please retake the photo with the barcode filling the frame in good light.');
      }
    };

    input.click();
  };

  function loadLib() {
    return new Promise((resolve, reject) => {
      if (window.Html5Qrcode) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load scanner library'));
      document.head.appendChild(s);
    });
  }
})();
