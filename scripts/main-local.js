// Client-only Face Recognition: stores data in the browser (localStorage)
// Requires: face-api.js loaded from CDN (see index.html)

(() => {
  const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
  const MATCH_THRESHOLD = 0.6; // smaller = stricter

  // DOM
  const statusEl = document.getElementById('status');
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const ctx = overlay.getContext('2d');

  const labelInput = document.getElementById('labelInput');
  const imageUpload = document.getElementById('imageUpload');
  const useCameraBtn = document.getElementById('useCameraBtn');
  const captureBtn = document.getElementById('captureBtn');
  const saveLabelBtn = document.getElementById('saveLabelBtn');
  const registeredList = document.getElementById('registeredList');
  const startRecBtn = document.getElementById('startRecBtn');
  const stopRecBtn = document.getElementById('stopRecBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const samplePreview = document.getElementById('samplePreview');

  const serverConfig = document.getElementById('serverConfig');
  if (serverConfig) serverConfig.style.display = 'none';

  let stream = null;
  let recognitionInterval = null;
  let tempCapturedImages = [];
  let faceMatcher = null;

  function setStatus(s) {
    statusEl.innerHTML = `<div class="status-dot"></div><span>${s}</span>`;
  }

  function updatePreview() {
    samplePreview.innerHTML = '';
    for (const img of tempCapturedImages) {
      const t = document.createElement('img');
      t.className = 'thumb';
      t.src = img.src;
      samplePreview.appendChild(t);
    }
  }

  // Local DB using localStorage
  const DB_KEY = 'faceDB_v1';
  const LocalDB = {
    data: { users: {} }, // { name: { descriptors: number[][], addedAt: string, expressions: string[] } }

    load() {
      try {
        const raw = localStorage.getItem(DB_KEY);
        this.data = raw ? JSON.parse(raw) : { users: {} };
      } catch (e) {
        this.data = { users: {} };
      }
    },
    save() {
      localStorage.setItem(DB_KEY, JSON.stringify(this.data));
    },
    listUsers() {
      return Object.keys(this.data.users).map(name => {
        const u = this.data.users[name];
        return {
          name,
          descriptorCount: (u.descriptors || []).length,
          lastExpression: (u.expressions || []).slice(-1)[0] || 'unknown',
          addedAt: u.addedAt
        };
      });
    },
    addSamples(name, descriptors, expressions) {
      if (!this.data.users[name]) {
        this.data.users[name] = { descriptors: [], expressions: [], addedAt: new Date().toISOString() };
      }
      this.data.users[name].descriptors.push(...descriptors);
      this.data.users[name].expressions.push(...expressions);
      this.save();
    },
    deleteUser(name) {
      delete this.data.users[name];
      this.save();
    },
    clearAll() {
      this.data = { users: {} };
      this.save();
    },
    export() {
      return JSON.stringify(this.data, null, 2);
    },
    async import(jsonText) {
      const obj = JSON.parse(jsonText);
      if (!obj || typeof obj !== 'object' || !obj.users) throw new Error('Invalid database file');
      this.data = obj;
      this.save();
    }
  };

  function rebuildMatcher() {
    const labels = Object.keys(LocalDB.data.users);
    const labeled = labels.map(name => new faceapi.LabeledFaceDescriptors(
      name,
      (LocalDB.data.users[name].descriptors || []).map(arr => new Float32Array(arr))
    ));
    faceMatcher = labeled.length ? new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD) : null;
  }

  // UI: list users
  function renderUserList() {
    registeredList.innerHTML = '';
    const users = LocalDB.listUsers();
    if (!users.length) {
      setStatus('No users stored yet');
      startRecBtn.disabled = true;
      return;
    }
    for (const u of users) {
      const div = document.createElement('div');
      div.className = 'tag';
      div.innerHTML = `
        <div>
          <strong>${u.name}</strong>
          <small>(${u.descriptorCount} sample(s), Last: ${u.lastExpression})</small>
        </div>
        <button data-name="${u.name}">Delete</button>
      `;
      div.querySelector('button').addEventListener('click', () => {
        if (confirm(`Delete user ${u.name}?`)) {
          LocalDB.deleteUser(u.name);
          rebuildMatcher();
          renderUserList();
          setStatus(`✅ Deleted ${u.name}`);
        }
      });
      registeredList.appendChild(div);
    }
    startRecBtn.disabled = false;
    setStatus(`✅ Loaded ${users.length} user(s) from local storage`);
  }

  // Image helpers
  function createImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function imageToTensor(img) {
    // face-api can take HTMLImageElement directly, no need to convert
    return img;
  }

  // Model loading
  async function loadModels() {
    setStatus('🔄 Loading AI models in browser...');
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
    setStatus('✅ Models loaded - ready');
  }

  // Registration logic
  async function computeDescriptorAndExpression(imgEl) {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
    const det = await faceapi
      .detectSingleFace(imgEl, options)
      .withFaceLandmarks()
      .withFaceDescriptor()
      .withFaceExpressions()
      .withAgeAndGender();

    if (!det) return null;

    const exprEntries = Object.entries(det.expressions || {});
    const dominant = exprEntries.reduce((a, b) => (a[1] > b[1] ? a : b), ['unknown', 0]);
    return {
      descriptor: Array.from(det.descriptor),
      expression: dominant[0],
      expressionConfidence: dominant[1],
      age: Math.round(det.age || 0),
      gender: det.gender || 'unknown',
      detection: det.detection
    };
  }

  async function registerCurrentSamples() {
    const name = (labelInput.value || '').trim();
    if (!name) return setStatus('❌ Enter a name');
    if (!tempCapturedImages.length) return setStatus('❌ No images to register');

    setStatus('🔬 Processing samples in browser...');

    const descriptors = []; const expressions = [];
    for (const img of tempCapturedImages) {
      const result = await computeDescriptorAndExpression(img);
      if (result) {
        descriptors.push(result.descriptor);
        expressions.push(result.expression);
      }
    }

    if (!descriptors.length) return setStatus('❌ No faces detected in samples');

    LocalDB.addSamples(name, descriptors, expressions);
    rebuildMatcher();
    renderUserList();

    labelInput.value = '';
    tempCapturedImages = [];
    saveLabelBtn.disabled = true;
    samplePreview.innerHTML = '';

    setStatus(`✅ Saved ${descriptors.length} sample(s) for ${name}`);
    showIdentification(name, `Registered locally with expression: ${expressions[0] || 'unknown'}`);
  }

  // Recognition loop
  async function runRecognition() {
    if (!faceMatcher) return; // nothing to match

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
    const results = await faceapi
      .detectAllFaces(video, options)
      .withFaceLandmarks()
      .withFaceDescriptors()
      .withFaceExpressions()
      .withAgeAndGender();

    if (!results || !results.length) {
      // Nothing detected; draw a subtle frame
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, overlay.width - 20, overlay.height - 20);
      return;
    }

    results.forEach(res => {
      const best = faceMatcher.findBestMatch(res.descriptor);
      const box = res.detection.box;

      const exprEntries = Object.entries(res.expressions || {});
      const dominant = exprEntries.reduce((a, b) => (a[1] > b[1] ? a : b), ['unknown', 0]);

      const recognized = best.label !== 'unknown';
      ctx.strokeStyle = recognized ? '#00ff88' : '#ff3366';
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      const label = recognized
        ? `${best.label} - ${dominant[0]} (${Math.round(dominant[1] * 100)}%)`
        : `Unknown - ${dominant[0]}`;

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(box.x - 2, box.y - 28, Math.max(140, ctx.measureText(label).width + 20), 24);
      ctx.fillStyle = '#00ffd0';
      ctx.font = 'bold 16px Poppins, sans-serif';
      ctx.fillText(label, box.x + 6, box.y - 10);

      setStatus(
        recognized
          ? `✅ Recognized: ${best.label} | ${dominant[0]} | Age: ~${Math.round(res.age)} | ${res.gender}`
          : `🕵️ Unknown person | ${dominant[0]}`
      );

      // Speak name
      if (recognized) {
        try {
          const utter = new SpeechSynthesisUtterance(`${best.label}, you look ${dominant[0]}`);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        } catch (_) {}
      }
    });
  }

  // Modal helpers from existing UI
  const idModal = document.getElementById('idModal');
  const modalClose = document.getElementById('modalClose');
  const modalName = document.getElementById('modalName');
  const modalInfo = document.getElementById('modalInfo');
  const modalConfirm = document.getElementById('modalConfirm');
  function showIdentification(name, info) {
    modalName.textContent = name;
    modalInfo.textContent = info || '';
    idModal.setAttribute('aria-hidden', 'false');
  }
  function hideIdentification() {
    idModal.setAttribute('aria-hidden', 'true');
  }
  modalClose.addEventListener('click', hideIdentification);
  modalConfirm.addEventListener('click', hideIdentification);

  // Event wiring
  imageUpload.addEventListener('change', async () => {
    if (!imageUpload.files.length) return;
    tempCapturedImages = [];
    setStatus('📸 Processing uploaded images...');

    for (const file of imageUpload.files) {
      try {
        const img = await createImageFromFile(file);
        tempCapturedImages.push(img);
      } catch (e) { /* skip */ }
    }
    if (tempCapturedImages.length) {
      setStatus(`✅ ${tempCapturedImages.length} image(s) ready. Enter name and click Save`);
      saveLabelBtn.disabled = false;
      captureBtn.disabled = true;
      updatePreview();
    }
  });

  useCameraBtn.addEventListener('click', async () => {
    if (stream) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
      video.addEventListener('loadedmetadata', () => {
        captureBtn.disabled = false;
        setStatus('📷 Camera started for capture');
      }, { once: true });
    } catch (e) {
      setStatus('❌ Camera access denied or unavailable');
    }
  });

  captureBtn.addEventListener('click', async () => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return setStatus('Video not ready');
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(video, 0, 0, w, h);
    const img = document.createElement('img');
    img.src = c.toDataURL('image/jpeg', 0.95);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    tempCapturedImages.push(img);
    setStatus(`📸 Captured photo (${tempCapturedImages.length} sample(s) ready)`);
    saveLabelBtn.disabled = false;
    updatePreview();
  });

  saveLabelBtn.addEventListener('click', registerCurrentSamples);

  clearAllBtn.addEventListener('click', () => {
    if (!confirm('Clear all locally stored data?')) return;
    LocalDB.clearAll();
    rebuildMatcher();
    renderUserList();
    setStatus('🧹 Local data cleared');
  });

  exportBtn.addEventListener('click', () => {
    try {
      const data = LocalDB.export();
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'face-db-export.json';
      a.click();
    } catch (e) {
      setStatus('❌ Export failed');
    }
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    if (!importFile.files.length) return;
    try {
      const text = await importFile.files[0].text();
      await LocalDB.import(text);
      rebuildMatcher();
      renderUserList();
      setStatus('✅ Imported database');
    } catch (e) {
      setStatus('❌ Import failed: ' + (e.message || e));
    } finally {
      importFile.value = '';
    }
  });

  startRecBtn.addEventListener('click', async () => {
    if (recognitionInterval) return;
    try {
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
      }
      await new Promise(res => {
        if (video.readyState >= 2 && video.videoWidth) return res();
        video.addEventListener('playing', () => res(), { once: true });
        video.addEventListener('loadedmetadata', () => res(), { once: true });
      });
      overlay.width = video.videoWidth || 640;
      overlay.height = video.videoHeight || 480;
      setStatus('✅ Recognition started (local)');
      startRecBtn.disabled = true;
      stopRecBtn.disabled = false;
      document.getElementById('clickHint').style.display = 'block';
      recognitionInterval = setInterval(runRecognition, 500);
    } catch (e) {
      setStatus('❌ Camera permission required');
    }
  });

  stopRecBtn.addEventListener('click', () => {
    if (recognitionInterval) {
      clearInterval(recognitionInterval);
      recognitionInterval = null;
    }
    startRecBtn.disabled = false;
    stopRecBtn.disabled = true;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    document.getElementById('clickHint').style.display = 'none';
    setStatus('⏹️ Recognition stopped');
  });

  // Init
  (async function init() {
    setStatus('🔄 Initializing...');
    LocalDB.load();
    rebuildMatcher();
    renderUserList();
    try {
      await loadModels();
    } catch (e) {
      setStatus('❌ Failed to load models from CDN');
    }
  })();
})();
