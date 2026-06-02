(function () {
  let targetField = null;
  let nativeStream = null;
  let animFrame = null;
  let zxingReader = null;

  window.openScanner = async function (fieldId, label) {
    targetField = fieldId;
    document.getElementById('scanner-label').textContent = 'Scan ' + label;
    setStatus('Starting camera…');
    setModal(true);

    if ('BarcodeDetector' in window) {
      await startNative();
    } else {
      await startZXing();
    }
  };

  async function startNative() {
    try {
      nativeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      const vid = document.getElementById('scanner-video');
      vid.srcObject = nativeStream;
      await vid.play();
      setStatus('Point camera at barcode');

      const detector = new BarcodeDetector({
        formats: ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'code_93', 'itf']
      });

      async function tick() {
        if (!nativeStream) return;
        try {
          const hits = await detector.detect(vid);
          if (hits.length) { onDetected(hits[0].rawValue); return; }
        } catch (_) {}
        animFrame = requestAnimationFrame(tick);
      }
      tick();
    } catch (_) {
      window.closeScanner();
      alert('Camera permission is required. Please allow access and try again.');
    }
  }

  async function startZXing() {
    try {
      setStatus('Loading scanner…');
      await loadZXing();
      const vid = document.getElementById('scanner-video');
      zxingReader = new window.ZXing.BrowserMultiFormatReader();

      const devices = await window.ZXing.BrowserCodeReader.listVideoInputDevices();
      const rear = devices.find(d => /back|rear|environment/i.test(d.label));
      const deviceId = (rear || devices[0] || {}).deviceId || null;

      setStatus('Point camera at barcode');
      await zxingReader.decodeFromVideoDevice(deviceId, vid, (result) => {
        if (result) onDetected(result.getText());
      });
    } catch (_) {
      setStatus('Live scan unavailable — use photo mode');
      document.getElementById('scanner-photo-btn').style.display = 'inline-block';
    }
  }

  window.scannerPhoto = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;
      img.onload = async () => {
        try {
          await loadZXing();
          const r = new window.ZXing.BrowserMultiFormatReader();
          const result = await r.decodeFromImageElement(img);
          onDetected(result.getText());
        } catch (_) {
          alert('No barcode found in the photo. Please try again with a clearer image.');
        } finally {
          URL.revokeObjectURL(url);
        }
      };
    };
    input.click();
  };

  function onDetected(raw) {
    const el = document.getElementById(targetField);
    if (el) {
      el.value = raw.trim().toUpperCase();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.closeScanner();
  }

  window.closeScanner = function () {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    if (zxingReader) { try { zxingReader.reset(); } catch (_) {} zxingReader = null; }
    if (nativeStream) { nativeStream.getTracks().forEach(t => t.stop()); nativeStream = null; }
    const vid = document.getElementById('scanner-video');
    if (vid) vid.srcObject = null;
    document.getElementById('scanner-photo-btn').style.display = 'none';
    setModal(false);
    targetField = null;
  };

  function setModal(on) {
    document.getElementById('scanner-modal').classList.toggle('visible', on);
  }

  function setStatus(msg) {
    document.getElementById('scanner-status').textContent = msg;
  }

  function loadZXing() {
    return new Promise((resolve, reject) => {
      if (window.ZXing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('ZXing load failed'));
      document.head.appendChild(s);
    });
  }
})();
