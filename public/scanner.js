(function () {
  let targetField = null;
  let html5Scanner = null;

  window.openScanner = async function (fieldId, label) {
    targetField = fieldId;
    document.getElementById('scanner-label').textContent = 'Scan ' + label;
    setStatus('Loading scanner…');
    setModal(true);
    await startHtml5();
  };

  async function startHtml5() {
    try {
      await loadLib();
      html5Scanner = new Html5Qrcode('scanner-viewfinder');

      // Get permission first so camera labels are readable
      const tmp = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      tmp.getTracks().forEach(t => t.stop());

      // Pick main rear camera by label (avoids fixed-focus ultra-wide on Samsung)
      const devices = await Html5Qrcode.getCameras();
      const main = devices.find(d => /^back camera$/i.test(d.label))
                || devices.find(d => /back|rear/i.test(d.label) && !/ultra|wide|macro|tele/i.test(d.label))
                || devices.find(d => /back|rear/i.test(d.label))
                || devices[devices.length - 1]
                || null;

      const cameraId = main ? { deviceId: main.id } : { facingMode: 'environment' };

      await html5Scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 280, height: 120 }, aspectRatio: 1.7 },
        (text) => onDetected(text),
        () => {}
      );

      setStatus('Point camera at barcode');
      document.getElementById('scanner-photo-btn').style.display = 'inline-block';
    } catch (err) {
      console.error('Scanner error:', err);
      setStatus('Live scan unavailable — use photo mode below');
      document.getElementById('scanner-photo-btn').style.display = 'inline-block';
    }
  }

  window.scannerTakePhoto = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await loadLib();
        const result = await Html5Qrcode.scanFile(file, true);
        onDetected(result);
      } catch (_) {
        alert('No barcode detected. Make sure the barcode fills the frame and is well-lit.');
      }
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

  window.closeScanner = async function () {
    if (html5Scanner) {
      try {
        if (html5Scanner.isScanning) await html5Scanner.stop();
        html5Scanner.clear();
      } catch (_) {}
      html5Scanner = null;
    }
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
