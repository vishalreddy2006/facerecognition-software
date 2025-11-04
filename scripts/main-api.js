// API Configuration - Always use localhost for development
const API_BASE_URL = 'http://localhost:3000/api';
const MODEL_PATH = '/weights';

// Log for debugging
console.log('API Base URL:', API_BASE_URL);

// Face-api.js models
let modelsLoaded = false;
let labeledFaceDescriptors = [];
let cachedFaceMatcher = null; // Cache the face matcher to avoid rebuilding

// DOM Elements
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
const samplePreview = document.getElementById('samplePreview');
const idModal = document.getElementById('idModal');
const modalClose = document.getElementById('modalClose');
const modalName = document.getElementById('modalName');
const modalInfo = document.getElementById('modalInfo');
const modalConfirm = document.getElementById('modalConfirm');

let stream = null;
let recognitionInterval = null;
let tempCapturedImages = [];
let lastRecognitionResult = null;
let lastRecognitionTime = 0;
const BANNER_DISPLAY_TIME = 5000; // 5 seconds for denied message
const GRANTED_RELOAD_DELAY = 2000; // 2 seconds before reloading on access granted

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

// Check server health
async function checkServerHealth() {
  try {
    console.log('Checking server health at:', `${API_BASE_URL}/health`);
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Server response status:', response.status);
    const data = await response.json();
    console.log('Server health data:', data);
    
    if (data.status === 'ok') {
      setStatus('✅ Server connected - Ready to use');
      return true;
    } else {
      setStatus('⚠️ Server connected but not ready');
      return false;
    }
  } catch (error) {
    console.error('Server connection error:', error);
    setStatus('❌ Cannot connect to server. Make sure backend is running on http://localhost:3000');
    return false;
  }
}

// Load registered users from database
async function loadRegisteredUsers() {
  try {
    const response = await fetch(`${API_BASE_URL}/users`);
    const data = await response.json();
    
    registeredList.innerHTML = '';
    if (data.users && data.users.length > 0) {
      for (const user of data.users) {
        const div = document.createElement('div');
        div.className = 'tag';
        
        const recentExpression = user.expressionHistory && user.expressionHistory.length > 0
          ? user.expressionHistory[user.expressionHistory.length - 1].expression
          : 'unknown';
        
        div.innerHTML = `
          <div>
            <strong>${user.name}</strong>
            <small>(${user.photoCount} photo(s), Last: ${recentExpression})</small>
          </div>
          <button onclick="deleteUser('${user.name}')">Delete</button>
        `;
        registeredList.appendChild(div);
      }
      setStatus(`✅ Loaded ${data.users.length} registered user(s)`);
      startRecBtn.disabled = false;
    } else {
      setStatus('No users registered yet');
      startRecBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error loading users:', error);
    setStatus('Error loading users');
  }
}

// Delete user
window.deleteUser = async function(name) {
  if (!confirm(`Delete user ${name}?`)) return;
  
  try {
    const response = await fetch(`${API_BASE_URL}/users/${name}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    
    if (data.success) {
      setStatus(`✅ Deleted user: ${name}`);
      cachedFaceMatcher = null; // Clear cache
      loadRegisteredUsers();
    }
  } catch (error) {
    console.error('Delete error:', error);
    setStatus('Error deleting user');
  }
};

// Image upload handler
imageUpload.addEventListener('change', async (e) => {
  if (!imageUpload.files.length) return;
  tempCapturedImages = [];
  setStatus('📸 Processing uploaded images...');
  
  for (const file of imageUpload.files) {
    try {
      const img = await createImageFromFile(file);
      tempCapturedImages.push(img);
    } catch (e) {
      console.warn('File read error', e);
    }
  }
  
  if (tempCapturedImages.length) {
    setStatus(`✅ ${tempCapturedImages.length} image(s) ready. Enter name and click Save`);
    saveLabelBtn.disabled = false;
    captureBtn.disabled = true;
    updatePreview();
  }
});

// Camera functions
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
    console.error(e);
    setStatus('❌ Camera access denied or unavailable');
  }
});

captureBtn.addEventListener('click', async () => {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) {
    setStatus('Video not ready');
    return;
  }
  
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(video, 0, 0, w, h);
  
  const img = document.createElement('img');
  img.src = c.toDataURL('image/png');
  
  try {
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    tempCapturedImages.push(img);
    setStatus(`📸 Captured photo (${tempCapturedImages.length} sample(s) ready)`);
    saveLabelBtn.disabled = false;
    updatePreview();
  } catch (e) {
    console.warn('Captured image load failed', e);
    setStatus('❌ Captured image failed to load');
  }
});

// Save user to database with face descriptors
saveLabelBtn.addEventListener('click', async () => {
  const name = (labelInput.value || '').trim();
  if (!name) {
    setStatus('❌ Enter a name');
    return;
  }
  if (!tempCapturedImages.length) {
    setStatus('❌ No images to register');
    return;
  }
  
  if (!modelsLoaded) {
    setStatus('❌ AI models not loaded yet. Please wait.');
    return;
  }
  
  setStatus('🔄 Analyzing faces...');
  
  const descriptors = [];
  let dominantExpression = 'neutral';
  let successCount = 0;
  let failureCount = 0;
  
  // Extract face descriptors from each image
  for (let i = 0; i < tempCapturedImages.length; i++) {
    const img = tempCapturedImages[i];
    const faceData = await extractFaceDescriptor(img);
    
    if (faceData) {
      descriptors.push(faceData.descriptor);
      dominantExpression = faceData.expression;
      successCount++;
      setStatus(`🔄 Processed ${i + 1}/${tempCapturedImages.length} photos (${successCount} faces found)...`);
    } else {
      failureCount++;
      setStatus(`⚠️ No face detected in photo ${i + 1} (${failureCount} failed)`);
    }
  }
  
  if (descriptors.length === 0) {
    setStatus(`❌ No faces detected in any of the ${tempCapturedImages.length} photo(s). Tips: Use clear, well-lit, front-facing photos with face clearly visible.`);
    return;
  }
  
  if (failureCount > 0) {
    setStatus(`⚠️ Found ${successCount} face(s), but ${failureCount} photo(s) had no detectable face. Continuing with ${successCount} sample(s)...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Show warning for 2 seconds
  }
  
  setStatus(`🔄 Uploading ${descriptors.length} face(s)...`);
  
  const formData = new FormData();
  formData.append('name', name);
  formData.append('descriptors', JSON.stringify(descriptors));
  
  // Convert images to blobs
  for (let i = 0; i < tempCapturedImages.length; i++) {
    const img = tempCapturedImages[i];
    const blob = await fetch(img.src).then(r => r.blob());
    formData.append('photos', blob, `photo-${i}.jpg`);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      setStatus(`✅ Registered ${name} with ${descriptors.length} face descriptor(s)`);
      labelInput.value = '';
      tempCapturedImages = [];
      saveLabelBtn.disabled = true;
      samplePreview.innerHTML = '';
      cachedFaceMatcher = null; // Clear cache
      await loadRegisteredUsers();
      await buildFaceMatcher(); // Rebuild matcher with new user
      
      // Show success message
      showIdentification(data.user.name, `Registered successfully with ${descriptors.length} face sample(s)`);
    } else {
      setStatus(`❌ ${data.error}`);
    }
  } catch (error) {
    console.error('Registration error:', error);
    setStatus('❌ Registration failed. Check server connection.');
  }
});

// Clear all data
clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Clear all stored data from database?')) return;
  
  try {
    const response = await fetch(`${API_BASE_URL}/clear-all`, {
      method: 'DELETE'
    });
    const data = await response.json();
    
    if (data.success) {
      setStatus('✅ All data cleared');
      cachedFaceMatcher = null; // Clear cache
      loadRegisteredUsers();
    }
  } catch (error) {
    console.error('Clear error:', error);
    setStatus('❌ Error clearing data');
  }
});

// Start recognition
startRecBtn.addEventListener('click', async () => {
  if (recognitionInterval) return;
  
  try {
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
    }
    
    await new Promise((res) => {
      if (video.readyState >= 2 && video.videoWidth) return res();
      video.addEventListener('playing', () => res(), { once: true });
      video.addEventListener('loadedmetadata', () => res(), { once: true });
    });
    
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    
    // Pre-build face matcher before starting recognition
    await buildFaceMatcher();
    
    setStatus('✅ Recognition started');
    startRecBtn.disabled = true;
    stopRecBtn.disabled = false;
    document.getElementById('clickHint').style.display = 'block';
    
    // Run recognition every 200ms for instant response
    recognitionInterval = setInterval(runRecognition, 200);
  } catch (e) {
    console.error(e);
    setStatus('❌ Camera permission required');
  }
});

// Stop recognition
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

// Recognition loop - uses AI in browser (OPTIMIZED)
async function runRecognition() {
  if (!modelsLoaded) {
    setStatus('⚠️ AI models still loading...');
    return;
  }
  
  const currentTime = Date.now();
  
  // If we have a recent recognition result, keep displaying it without reprocessing
  if (lastRecognitionResult && (currentTime - lastRecognitionTime) < BANNER_DISPLAY_TIME) {
    // Don't clear or redraw - just maintain the existing display
    return;
  }
  
  // Only clear and reset when cache expires
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  
  try {
    // OPTIMIZED: Use fastest detection options
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,        // Good balance of speed and accuracy
      scoreThreshold: 0.4    // Lower threshold for better detection
    });
    
    // Get descriptor with landmarks (landmarks are required for descriptor extraction)
    const detection = await faceapi
      .detectSingleFace(video, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    if (!detection) {
      // No face detected - clear the banner and show status
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      setStatus('👤 No face detected - Move closer to camera');
      // Don't cache "no face" result, keep checking
      return;
    }
    
    // Use cached face matcher (no need to rebuild every frame)
    if (!cachedFaceMatcher) {
      cachedFaceMatcher = await buildFaceMatcher();
    }
    
    if (!cachedFaceMatcher) {
      lastRecognitionResult = {
        success: true,
        recognized: false,
        message: 'No users registered',
        expression: 'neutral',
        expressionConfidence: 0,
        age: 0,
        gender: 'unknown'
      };
      lastRecognitionTime = currentTime;
      drawRecognitionResult(lastRecognitionResult);
      return;
    }
    
    // Match face against registered users (INSTANT)
    const bestMatch = cachedFaceMatcher.findBestMatch(detection.descriptor);
    
    // STRICT VALIDATION: Double-check the distance
    // Distance < 0.45 = Same person (good match)
    // Distance > 0.45 = Different person (reject)
    const isRecognized = bestMatch.label !== 'unknown' && bestMatch.distance < 0.45;
    
    // Log for debugging
    console.log('Face Match Result:', {
      label: bestMatch.label,
      distance: bestMatch.distance,
      recognized: isRecognized,
      threshold: 0.45
    });
    
    // For MAXIMUM SPEED: Skip expressions/age/gender entirely during recognition
    // These take 100-200ms extra and aren't needed for access control
    const resultData = {
      success: true,
      recognized: isRecognized,
      name: isRecognized ? bestMatch.label : null,
      confidence: (1 - bestMatch.distance).toFixed(2),
      distance: bestMatch.distance.toFixed(2),
      expression: 'neutral',  // Skip for speed
      expressionConfidence: 0,
      age: 0,
      gender: 'unknown',
      genderConfidence: 0,
      box: detection.detection.box
    };
    
    // Store result and timestamp
    lastRecognitionResult = resultData;
    lastRecognitionTime = currentTime;
    
    // Draw the result
    drawRecognitionResult(resultData);
    
    // Handle access granted vs denied
    if (resultData.recognized) {
      // ACCESS GRANTED - Log to server and reload page after delay
      try {
        await fetch(`${API_BASE_URL}/log-recognition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: resultData.name,
            expression: resultData.expression,
            age: resultData.age,
            gender: resultData.gender
          })
        });
      } catch (e) {
        // Ignore logging errors
      }
      
      // Reload page after showing access granted message
      if (!resultData.reloadScheduled) {
        resultData.reloadScheduled = true;
        setTimeout(() => {
          location.reload();
        }, GRANTED_RELOAD_DELAY);
      }
    } else {
      // ACCESS DENIED - Don't reload, just show message
      // Voice alert will be handled in drawRecognitionResult
    }
    
  } catch (error) {
    console.error('Recognition error:', error);
  }
}

// Function to draw recognition result on canvas
function drawRecognitionResult(data) {
  if (data.noFace) {
    // No face detected - clear canvas
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    setStatus('👤 No face detected - Move closer to camera');
    return;
  }
  
  if (data.success && data.recognized) {
      // Draw box around face
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, overlay.width - 20, overlay.height - 20);
      
      // Draw label with name and confidence
      const label = `${data.name} - Confidence: ${Math.round(data.confidence * 100)}%`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, overlay.height - 60, overlay.width - 20, 50);
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 20px Poppins';
      ctx.fillText(label, 20, overlay.height - 30);

      // Access Granted banner
      const banner = 'ACCESS GRANTED';
      ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
      ctx.fillRect(0, overlay.height/2 - 60, overlay.width, 120);
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 42px Poppins';
      const bw = ctx.measureText(banner).width;
      ctx.fillText(banner, (overlay.width - bw) / 2, overlay.height/2 + 14);

      // Username centered
      ctx.font = 'bold 28px Poppins';
      const un = data.name.toUpperCase();
      const uw = ctx.measureText(un).width;
      ctx.fillText(un, (overlay.width - uw) / 2, overlay.height/2 + 48);
      
      // Update status - simplified for speed
      setStatus(`✅ ACCESS GRANTED - Welcome ${data.name}! Reloading...`);
      
      // Speak name (only once when first recognized)
      if (!data.spokenAlready) {
        try {
          const utter = new SpeechSynthesisUtterance(`Access granted. Welcome ${data.name}`);
          utter.rate = 1.2; // Slightly faster
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
          data.spokenAlready = true;
        } catch (e) {}
      }
    } else {
      // Unknown person - ACCESS DENIED
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, overlay.width - 20, overlay.height - 20);
      
      const label = 'PLEASE REGISTER';
      ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.fillRect(10, overlay.height - 60, overlay.width - 20, 50);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Poppins';
      ctx.fillText(label, 20, overlay.height - 30);

      // Access Denied banner
      const banner = 'ACCESS DENIED';
      ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
      ctx.fillRect(0, overlay.height/2 - 60, overlay.width, 120);
      ctx.fillStyle = '#ff3b3b';
      ctx.font = 'bold 42px Poppins';
      const bw = ctx.measureText(banner).width;
      ctx.fillText(banner, (overlay.width - bw) / 2, overlay.height/2 + 14);
      
      // Show "Please Register" message
      ctx.font = 'bold 20px Poppins';
      const msg = 'PLEASE REGISTER';
      const mw = ctx.measureText(msg).width;
      ctx.fillText(msg, (overlay.width - mw) / 2, overlay.height/2 + 48);
      
      setStatus('❌ ACCESS DENIED - Unknown person. Please register.');
      
      // Voice alert for access denied (only once)
      if (!data.spokenAlready) {
        try {
          const utter = new SpeechSynthesisUtterance('Access denied. Please register.');
          utter.rate = 1.2;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
          data.spokenAlready = true;
        } catch (e) {}
      }
    }
}

// Modal functions
function showIdentification(name, info) {
  modalName.textContent = name;
  modalInfo.textContent = info;
  idModal.setAttribute('aria-hidden', 'false');
}

function hideIdentification() {
  idModal.setAttribute('aria-hidden', 'true');
}

modalClose.addEventListener('click', hideIdentification);
modalConfirm.addEventListener('click', hideIdentification);

// Helper functions
function createImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Load face-api.js AI models from CDN (more reliable)
async function loadFaceModels() {
  try {
    setStatus('📦 Loading AI models from CDN...');
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
    
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    setStatus('📦 Loaded face detector...');
    
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    setStatus('📦 Loaded landmarks...');
    
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    setStatus('📦 Loaded recognition...');
    
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    setStatus('📦 Loaded expressions...');
    
    await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
    setStatus('📦 Loaded age/gender...');
    
    modelsLoaded = true;
    setStatus('✅ AI models loaded - Ready for face recognition');
    return true;
  } catch (error) {
    console.error('Model loading error:', error);
    setStatus('❌ Failed to load AI models: ' + error.message);
    return false;
  }
}

// Extract face descriptor from image element
async function extractFaceDescriptor(imageElement) {
  if (!modelsLoaded) return null;
  
  try {
    // Use lower detection threshold for better face detection (default is 0.5)
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,        // Larger input size for better detection (default: 416)
      scoreThreshold: 0.3    // Lower threshold = more sensitive (default: 0.5)
    });
    
    const detection = await faceapi
      .detectSingleFace(imageElement, options)
      .withFaceLandmarks()
      .withFaceDescriptor()
      .withFaceExpressions()
      .withAgeAndGender();
    
    if (!detection) {
      console.warn('No face detected in image:', imageElement.src.substring(0, 50));
      return null;
    }
    
    return {
      descriptor: Array.from(detection.descriptor),
      expression: detection.expressions.asSortedArray()[0].expression,
      expressionConfidence: detection.expressions.asSortedArray()[0].probability,
      age: Math.round(detection.age),
      gender: detection.gender,
      genderProbability: detection.genderProbability,
      box: detection.detection.box
    };
  } catch (error) {
    console.error('Face extraction error:', error);
    return null;
  }
}

// Build face matcher from database (CACHED)
async function buildFaceMatcher() {
  try {
    const response = await fetch(`${API_BASE_URL}/users`);
    const data = await response.json();
    
    if (!data.users || data.users.length === 0) {
      labeledFaceDescriptors = [];
      cachedFaceMatcher = null;
      return null;
    }
    
    const labeled = [];
    for (const user of data.users) {
      if (user.descriptors && user.descriptors.length > 0) {
        const descriptors = user.descriptors.map(d => new Float32Array(d));
        labeled.push(new faceapi.LabeledFaceDescriptors(user.name, descriptors));
      }
    }
    
    labeledFaceDescriptors = labeled;
    
    if (labeled.length === 0) {
      cachedFaceMatcher = null;
      return null;
    }
    
    // Cache the matcher to avoid rebuilding on every frame
    // Lower threshold = stricter matching (0.5 = only 50% dissimilarity allowed)
    cachedFaceMatcher = new faceapi.FaceMatcher(labeled, 0.45); // Stricter threshold
    return cachedFaceMatcher;
  } catch (error) {
    console.error('Error building face matcher:', error);
    cachedFaceMatcher = null;
    return null;
  }
}

// Initialize on page load
(async () => {
  setStatus('🔄 Initializing...');
  
  // Wait for face-api.js to load
  let attempts = 0;
  while (typeof faceapi === 'undefined' && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (typeof faceapi === 'undefined') {
    setStatus('❌ Face-api.js failed to load');
    return;
  }
  
  // Load AI models
  const modelsOk = await loadFaceModels();
  
  // Connect to server
  const serverReady = await checkServerHealth();
  if (serverReady && modelsOk) {
    await loadRegisteredUsers();
  }
  
  // Check server health every 10 seconds
  setInterval(checkServerHealth, 10000);
})();
