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
    await startZXing();
  };

  // Photo fallback triggered by the "Take Photo" button in the scanner modal
  window.scannerTakePhoto = function () {
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
          const canvas = document.createElement('canvas');
          const max = 1920;
          const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          canvas.width  = Math.round(img.naturalWidth  * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

          if ('BarcodeDetector' in window) {
            const detector = new BarcodeDetector({
              formats: ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'code_93', 'itf']
            });
            let hits = await detector.detect(canvas);
            if (!hits.length) hits = await detector.detect(img);
            if (hits.length) { onDetected(hits[0].rawValue); return; }
          }
          await loadZXing();
          const r = new window.ZXing.BrowserMultiFormatReader();
          const result = await r.decodeFromImageElement(img);
          onDetected(result.getText());
        } catch (_) {
          alert('No barcode detected. Make sure the barcode fills the frame and is well-lit.');
        } finally {
          URL.revokeObjectURL(url);
        }
      };
    };
    input.click();
  };

  async function startNative() {
    try {
      // Enumerate cameras and prefer the main rear camera (avoids fixed-focus ultra-wide)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      const mainCam = cams.find(d => /back|rear/i.test(d.label) && !/ultra|wide|macro/i.test(d.label))
                   || cams.find(d => /back|rear/i.test(d.label))
                   || null;

      const constraints = mainCam
        ? { video: { deviceId: { exact: mainCam.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } };

      nativeStream = await navigator.mediaDevices.getUserMedia(constraints);
      const vid = document.getElementById('scanner-video');
      vid.srcObject = nativeStream;
      await vid.play();

      const track = nativeStream.getVideoTracks()[0];
      if (track.applyConstraints) {
        try { await track.applyConstraints({ focusMode: 'continuous' }); } catch (_) {}
      }

      // Tap to re-focus
      vid.addEventListener('click', async () => {
        try {
          await track.applyConstraints({ focusMode: 'single-shot' });
          setTimeout(() => track.applyConstraints({ focusMode: 'continuous' }).catch(() => {}), 600);
        } catch (_) {}
      });

      setStatus('Hold barcode steady in the box…');

      const detector = new BarcodeDetector({
        formats: ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'code_93', 'itf']
      });

      // Use takePhoto() which triggers real autofocus — far sharper than video frames
      const imageCapture = ('ImageCapture' in window) ? new ImageCapture(track) : null;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      async function tick() {
        if (!nativeStream) return;
        try {
          let source;
          if (imageCapture) {
            try {
              const blob = await imageCapture.takePhoto();
              source = await createImageBitmap(blob);
            } catch (_) {
              try { source = await imageCapture.grabFrame(); } catch (_2) {}
            }
          }
          if (!source && vid.videoWidth) {
            canvas.width = vid.videoWidth;
            canvas.height = vid.videoHeight;
            ctx.drawImage(vid, 0, 0);
            source = canvas;
          }
          if (source) {
            const hits = await detector.detect(source);
            if (source.close) source.close();
            if (hits.length) { onDetected(hits[0].rawValue); return; }
          }
        } catch (_) {}
        animFrame = setTimeout(() => { animFrame = requestAnimationFrame(tick); }, 800);
      }
      tick();

      document.getElementById('scanner-photo-btn').style.display = 'inline-block';
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

      // Select rear camera — prefer main camera over ultra-wide
      const devices = await window.ZXing.BrowserCodeReader.listVideoInputDevices();
      const rear = devices.find(d => /back|rear/i.test(d.label) && !/ultra|wide|macro/i.test(d.label))
                || devices.find(d => /back|rear/i.test(d.label))
                || devices[devices.length - 1]
                || null;
      const deviceId = rear ? rear.deviceId : null;

      setStatus('Point camera at barcode');
      await zxingReader.decodeFromVideoDevice(deviceId, vid, (result) => {
        if (result) onDetected(result.getText());
      });

      document.getElementById('scanner-photo-btn').style.display = 'inline-block';
    } catch (_) {
      setStatus('Live scan unavailable — use photo mode below');
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
