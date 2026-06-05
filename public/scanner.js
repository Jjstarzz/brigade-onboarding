(function () {
  let targetField = null;
  let nativeStream = null;
  let animFrame = null;
  let zxingReader = null;

  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

  window.openScanner = async function (fieldId, label) {
    targetField = fieldId;

    if (isMobile) {
      // On mobile use the native camera — handles autofocus perfectly
      mobilePhotoCapture();
      return;
    }

    document.getElementById('scanner-label').textContent = 'Scan ' + label;
    setStatus('Starting camera…');
    setModal(true);

    if ('BarcodeDetector' in window) {
      await startNative();
    } else {
      await startZXing();
    }
  };

  function mobilePhotoCapture() {
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
          if ('BarcodeDetector' in window) {
            const detector = new BarcodeDetector({
              formats: ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'code_93', 'itf']
            });
            const hits = await detector.detect(img);
            if (hits.length) { onDetected(hits[0].rawValue); return; }
          }
          // BarcodeDetector missed it — try ZXing
          await loadZXing();
          const r = new window.ZXing.BrowserMultiFormatReader();
          const result = await r.decodeFromImageElement(img);
          onDetected(result.getText());
        } catch (_) {
          alert('No barcode found. Please retake the photo closer to the barcode.');
        } finally {
          URL.revokeObjectURL(url);
        }
      };
    };
    input.click();
  }

  async function startNative() {
    try {
      nativeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      const vid = document.getElementById('scanner-video');
      vid.srcObject = nativeStream;
      await vid.play();

      const track = nativeStream.getVideoTracks()[0];

      // Enable continuous autofocus and 2x zoom (helps Samsung focus on close barcodes)
      if (track.applyConstraints) {
        try { await track.applyConstraints({ focusMode: 'continuous' }); } catch (_) {}
        try { await track.applyConstraints({ zoom: 2 }); } catch (_) {}
      }

      // Tap anywhere on video to trigger single-shot re-focus
      vid.addEventListener('click', async () => {
        try {
          await track.applyConstraints({ focusMode: 'single-shot' });
          setTimeout(() => track.applyConstraints({ focusMode: 'continuous' }).catch(() => {}), 800);
        } catch (_) {}
      });

      setStatus('Focusing… (tap screen to focus)');
      await new Promise(r => setTimeout(r, 1500));
      setStatus('Point camera at barcode — tap to focus');

      const detector = new BarcodeDetector({
        formats: ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'code_93', 'itf']
      });

      // Use ImageCapture.grabFrame() for sharp individual frames if available
      const imageCapture = ('ImageCapture' in window) ? new ImageCapture(track) : null;

      async function tick() {
        if (!nativeStream) return;
        try {
          let src = vid;
          if (imageCapture) {
            try { src = await imageCapture.grabFrame(); } catch (_) { src = vid; }
          }
          const hits = await detector.detect(src);
          if (src !== vid && src.close) src.close();
          if (hits.length) { onDetected(hits[0].rawValue); return; }
        } catch (_) {}
        animFrame = setTimeout(() => { animFrame = requestAnimationFrame(tick); }, 150);
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
