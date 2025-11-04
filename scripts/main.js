// main.js - handles registration, persistence, camera capture and live recognition

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'

const statusEl = document.getElementById('status')
const video = document.getElementById('video')
const overlay = document.getElementById('overlay')
const ctx = overlay.getContext('2d')

const labelInput = document.getElementById('labelInput')
const imageUpload = document.getElementById('imageUpload')
const useCameraBtn = document.getElementById('useCameraBtn')
const captureBtn = document.getElementById('captureBtn')
const saveLabelBtn = document.getElementById('saveLabelBtn')
const registeredList = document.getElementById('registeredList')
const startRecBtn = document.getElementById('startRecBtn')
const stopRecBtn = document.getElementById('stopRecBtn')
const clearAllBtn = document.getElementById('clearAllBtn')
const exportBtn = document.getElementById('exportBtn')
const importBtn = document.getElementById('importBtn')
const importFile = document.getElementById('importFile')
const useServerCheckbox = document.getElementById('useServer')
const serverUrlInput = document.getElementById('serverUrlInput')
const clickHint = document.getElementById('clickHint')
const idModal = document.getElementById('idModal')
const modalClose = document.getElementById('modalClose')
const modalName = document.getElementById('modalName')
const modalInfo = document.getElementById('modalInfo')
const modalConfirm = document.getElementById('modalConfirm')
const requireLiveness = document.getElementById('requireLiveness')
const livenessStatus = document.getElementById('livenessStatus')
const webhookUrl = document.getElementById('webhookUrl')
const testWebhook = document.getElementById('testWebhook')
const logList = document.getElementById('logList')
const samplePreview = document.getElementById('samplePreview')

function updatePreview(){
  samplePreview.innerHTML = ''
  for(const img of tempCapturedImages){
    const t = document.createElement('img')
    t.className = 'thumb'
    t.src = img.src
    samplePreview.appendChild(t)
  }
}

let stream = null
let recognitionInterval = null
let labeledDescriptors = []
let faceMatcher = null
let tempCapturedImages = [] // images (HTMLImageElement) captured/uploaded for current label
let modelsLoaded = false
// liveness detection state
let livenessWindow = [] // store recent eye ratios
const LIVENESS_WINDOW_SIZE = 10
const BLINK_THRESHOLD = 0.22
let lastLiveness = false

function eyeAspectRatio(landmarks, left = true){
  // landmarks are 68 points; left eye indices 36-41, right eye 42-47
  const indices = left ? [36,37,38,39,40,41] : [42,43,44,45,46,47]
  const pts = indices.map(i=>landmarks.get(i))
  // pts[0..5] x,y
  function d(a,b){ const dx = pts[a].x-pts[b].x; const dy = pts[a].y-pts[b].y; return Math.hypot(dx,dy) }
  const A = d(1,5)
  const B = d(2,4)
  const C = d(0,3)
  return (A + B) / (2.0 * C)
}

function updateLiveness(landmarks){
  try{
    const left = eyeAspectRatio(landmarks, true)
    const right = eyeAspectRatio(landmarks, false)
    const avg = (left+right)/2
    livenessWindow.push(avg)
    if(livenessWindow.length > LIVENESS_WINDOW_SIZE) livenessWindow.shift()
    // detect blink as avg dropping below threshold within window
    const minVal = Math.min(...livenessWindow)
    const alive = minVal < BLINK_THRESHOLD
    lastLiveness = alive
    livenessStatus.textContent = alive ? 'Live (blink detected)' : 'No blink'
    livenessStatus.style.color = alive ? '#0b8a3e' : '#b33'
    return alive
  }catch(e){ return false }
}

// logging
function pushLog(entry){
  const logsRaw = localStorage.getItem('face_logs_v1')
  const logs = logsRaw ? JSON.parse(logsRaw) : []
  logs.unshift(entry)
  localStorage.setItem('face_logs_v1', JSON.stringify(logs.slice(0,200)))
  renderLogs()
}

function renderLogs(){
  const logsRaw = localStorage.getItem('face_logs_v1')
  const logs = logsRaw ? JSON.parse(logsRaw) : []
  logList.innerHTML = ''
  for(const l of logs){
    const d = document.createElement('div'); d.className='logItem'
    d.textContent = `${l.time} - ${l.event} - ${l.name || l.label || 'unknown'}`
    logList.appendChild(d)
  }
}

async function sendWebhook(payload){
  // if server storage enabled, upload snapshot first (if present) and POST to server /log
  if(useServerCheckbox && useServerCheckbox.checked && serverUrlInput && serverUrlInput.value){
    try{
      // if payload contains snapshot dataURL, upload it as file
      if(payload.snapshot && payload.snapshot.startsWith('data:')){
        const blob = await (await fetch(payload.snapshot)).blob()
        const fd = new FormData()
        fd.append('snapshot', blob, 'snapshot.jpg')
        const upUrl = new URL('/upload', serverUrlInput.value).toString()
        const upRes = await fetch(upUrl, { method: 'POST', body: fd })
        const upJson = await upRes.json()
        if(upJson && upJson.url){ payload.imageUrl = upJson.url; delete payload.snapshot }
      }
      const url = new URL('/log', serverUrlInput.value).toString()
      await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      pushLog({ time: new Date().toLocaleString(), event: 'webhook_sent', name: payload.label })
      return
    }catch(e){ console.error('Server log failed', e); pushLog({ time: new Date().toLocaleString(), event: 'webhook_failed', name: payload.label }) }
  }
  const url = webhookUrl.value && webhookUrl.value.trim()
  if(!url) return
  try{
    await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
    pushLog({ time: new Date().toLocaleString(), event: 'webhook_sent', name: payload.name })
  }catch(e){
    pushLog({ time: new Date().toLocaleString(), event: 'webhook_failed', name: payload.name })
    console.error('Webhook failed', e)
  }
}

testWebhook.addEventListener('click', ()=>{
  const payload = { test: true, time: new Date().toISOString() }
  sendWebhook(payload)
  alert('Test alert sent (if URL configured)')
})

renderLogs()

function setStatus(s){ statusEl.textContent = s }

async function loadModels(){
  setStatus('Loading models...')
    // try local weights folder first (./weights). If it fails, fallback to CDN with retries
    const local = './weights'
    async function tryLoadFrom(uriBase){
      // list of nets we need
      const nets = [
        faceapi.nets.tinyFaceDetector,
        faceapi.nets.faceLandmark68Net,
        faceapi.nets.faceRecognitionNet,
        faceapi.nets.ageGenderNet,
        faceapi.nets.faceExpressionNet
      ]
      for(const net of nets){
        try{
          await net.loadFromUri(uriBase)
          console.debug('Loaded net from', uriBase)
        }catch(e){
          console.error('Failed to load net from', uriBase, e)
          throw e
        }
      }
    }

    // First try local
    try{
      await tryLoadFrom(local)
      modelsLoaded = true
      setStatus('Models loaded (local)')
      console.info('Loaded models from local weights folder')
      try{ imageUpload.disabled = false }catch(e){}
      try{ useCameraBtn.disabled = false }catch(e){}
      return
    }catch(localErr){
      console.warn('Local models not available:', localErr)
    }

    // Try CDN with retry/backoff
    const maxRetries = 3
    for(let attempt=1; attempt<=maxRetries; attempt++){
      try{
        setStatus(`Loading models from CDN (attempt ${attempt}/${maxRetries})`)
        await tryLoadFrom(MODEL_URL)
        modelsLoaded = true
        setStatus('Models loaded (CDN)')
        console.info('Loaded models from CDN')
        try{ imageUpload.disabled = false }catch(e){}
        try{ useCameraBtn.disabled = false }catch(e){}
        return
      }catch(err){
        console.warn(`CDN model load attempt ${attempt} failed:`, err)
        // small backoff
        await new Promise(r=>setTimeout(r, 800 * attempt))
      }
    }
    console.error('All model load attempts failed')
    setStatus('Failed to load models - check console and network (CORS/blocked)')
    // enable UI now models are loaded (kept as fallback)
    try{ imageUpload.disabled = false }catch(e){}
    try{ useCameraBtn.disabled = false }catch(e){}
}

// Resize an image to max dimension for faster processing
function resizeImage(img, maxSize = 600){
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if(!w || !h) return img
  const ratio = Math.max(w, h) / maxSize
  if(ratio <= 1) return img
  const nw = Math.round(w / ratio)
  const nh = Math.round(h / ratio)
  const c = document.createElement('canvas')
  c.width = nw; c.height = nh
  const cx = c.getContext('2d')
  cx.drawImage(img, 0, 0, nw, nh)
  return c
}

// persistence - save/load labeled descriptors to localStorage
function descriptorsToJSON(ld){
  return ld.map(l => ({ label: l.label, descriptors: l.descriptors.map(d => Array.from(d)) }))
}

function jsonToDescriptors(json){
  return json.map(l => new faceapi.LabeledFaceDescriptors(
    l.label,
    l.descriptors.map(d => new Float32Array(d))
  ))
}

function saveDescriptors(){
  try{
    const payload = descriptorsToJSON(labeledDescriptors)
    // if server is enabled, POST to server
    if(useServerCheckbox && useServerCheckbox.checked && serverUrlInput && serverUrlInput.value){
      fetch(new URL('/descriptors', serverUrlInput.value).toString(), { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(r=> r.ok ? setStatus('Saved to server') : setStatus('Server save failed'))
        .catch(e=>{ console.error(e); setStatus('Server save failed') })
    }else{
      localStorage.setItem('face_descriptors_v1', JSON.stringify(payload))
      setStatus('Saved registered users (local)')
    }
  }catch(e){
    console.error(e)
    setStatus('Failed to save: ' + e.message)
  }
}

function loadDescriptors(){
  // if server is enabled, fetch from server
  if(useServerCheckbox && useServerCheckbox.checked && serverUrlInput && serverUrlInput.value){
    try{
      fetch(new URL('/descriptors', serverUrlInput.value).toString())
        .then(r=>r.json())
        .then(parsed=>{
          const arr = jsonToDescriptors(parsed)
          labeledDescriptors = arr
          setStatus('Loaded ' + arr.length + ' registered user(s) from server')
          refreshRegisteredList()
          rebuildMatcher()
        }).catch(e=>{ console.error(e); setStatus('Failed to load from server') })
    }catch(e){ console.error(e); setStatus('Invalid server URL') }
    return []
  }
  const raw = localStorage.getItem('face_descriptors_v1')
  if(!raw) return []
  try{
    const parsed = JSON.parse(raw)
    const arr = jsonToDescriptors(parsed)
    labeledDescriptors = arr
    setStatus('Loaded ' + arr.length + ' registered user(s)')
    return arr
  }catch(e){
    console.error(e)
    setStatus('Failed to load stored data')
    return []
  }
}

function rebuildMatcher(){
  if(labeledDescriptors.length){
    try{
      faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6)
      setStatus(`Matcher ready (${labeledDescriptors.length} label(s))`)
      try{ startRecBtn.disabled = false }catch(e){}
      console.debug('FaceMatcher created for labels:', labeledDescriptors.map(l=>l.label))
    }catch(e){
      console.error('Failed to build FaceMatcher', e)
      faceMatcher = null
      setStatus('Failed to build matcher')
    }
  } else {
    faceMatcher = null
    setStatus('No registered users')
    try{ startRecBtn.disabled = true }catch(e){}
  }
}

function refreshRegisteredList(){
  registeredList.innerHTML = ''
  labeledDescriptors.forEach((l, idx) =>{
    const div = document.createElement('div')
    div.className = 'tag'
    div.innerHTML = `<strong>${l.label}</strong> <small>(${l.descriptors.length} sample(s))</small>`
    const del = document.createElement('button')
    del.textContent = 'Delete'
    del.onclick = ()=>{
      if(confirm('Delete label ' + l.label + '?')){
        labeledDescriptors.splice(idx,1)
        saveDescriptors(); rebuildMatcher(); refreshRegisteredList()
      }
    }
    div.appendChild(del)
    registeredList.appendChild(div)
  })
}

// image helpers
function createImageFromFile(file){
  return new Promise((resolve,reject)=>{
    const img = document.createElement('img')
    img.onload = ()=>resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

async function computeDescriptorsFromImage(img){
  const detections = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor()
  if(!detections) return null
  return detections.descriptor
}

// register flows
imageUpload.addEventListener('change', async e=>{
  if(!imageUpload.files.length) return
  tempCapturedImages = []
  setStatus('Processing uploaded images...')
  for(const f of imageUpload.files){
    try{
      const img = await createImageFromFile(f)
      tempCapturedImages.push(img)
    }catch(e){console.warn('file read error',e)}
  }
  if(tempCapturedImages.length) {
    setStatus(tempCapturedImages.length + ' image(s) ready. Enter label and Save.')
    saveLabelBtn.disabled = false
    captureBtn.disabled = true
    updatePreview()
  }
})

useCameraBtn.addEventListener('click', async ()=>{
  if(stream) return
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    video.srcObject = stream
    // enable capture once video has play dimensions
    video.addEventListener('loadedmetadata', ()=>{
      captureBtn.disabled = false
      setStatus('Camera started for capture. Click Capture to take a photo.')
    }, { once: true })
  }catch(e){
    console.error(e)
    setStatus('Camera access denied or unavailable')
  }
})

captureBtn.addEventListener('click', async ()=>{
  // capture current frame to an image element
  const w = video.videoWidth, h = video.videoHeight
  if(!w||!h){ setStatus('Video not ready'); return }
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d').drawImage(video,0,0,w,h)
  const img = document.createElement('img')
  img.src = c.toDataURL('image/png')
  // wait until image is loaded
  try{
    await new Promise((res, rej)=>{ img.onload = res; img.onerror = rej; })
    tempCapturedImages.push(img)
    setStatus('Captured photo. ('+tempCapturedImages.length+' sample(s) ready)')
    saveLabelBtn.disabled = false
    updatePreview()
  }catch(e){
    console.warn('Captured image load failed', e)
    setStatus('Captured image failed to load')
  }
})

saveLabelBtn.addEventListener('click', async ()=>{
  const label = (labelInput.value||'').trim()
  if(!label) { setStatus('Enter a label name'); return }
  if(!tempCapturedImages.length){ setStatus('No images to register'); return }
  if(!modelsLoaded){ setStatus('Models not loaded yet. Wait a moment.'); return }
  setStatus('Computing descriptors for ' + tempCapturedImages.length + ' image(s) ...')
  // show spinner in status
  const spin = document.createElement('span')
  spin.className = 'spinner'
  statusEl.appendChild(document.createTextNode(' '))
  statusEl.appendChild(spin)
  const descriptors = []
  // create hidden container to append images to DOM during processing
  const tempContainer = document.createElement('div')
  tempContainer.style.display = 'none'
  document.body.appendChild(tempContainer)
  let successCount = 0, failCount = 0
  for(const [i,img] of tempCapturedImages.entries()){
    try{
      // ensure the image is in the DOM for accurate processing
      if(!img.parentElement) tempContainer.appendChild(img)
      // wait until image is fully loaded
      if(!img.complete) await new Promise((res,rej)=>{ img.onload = res; img.onerror = rej })
      // resize for performance
      const processTarget = resizeImage(img, 600)
      const d = await computeDescriptorsFromImage(processTarget)
      if(d){ descriptors.push(d); successCount++; console.debug(`Image ${i} descriptor OK`) }
      else { failCount++; console.debug(`Image ${i} no face detected`) }
    }catch(e){console.warn('descriptor failed',e)}
  }
  // cleanup
  tempContainer.remove()
  spin.remove()
  if(!descriptors.length){ setStatus(`No faces detected in provided images (success: ${successCount}, failed: ${failCount})`); return }
  // if label exists, append; else create
  const existing = labeledDescriptors.find(l=>l.label === label)
  if(existing){
    existing.descriptors.push(...descriptors)
  }else{
    labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(label, descriptors))
  }
  saveDescriptors(); rebuildMatcher(); refreshRegisteredList()
  tempCapturedImages = []
  saveLabelBtn.disabled = true
  setStatus(`Registered '${label}' with ${descriptors.length} sample(s). (success: ${successCount}, failed: ${failCount}) You can now Start Recognition.`)
})

clearAllBtn.addEventListener('click', ()=>{
  if(!confirm('Clear all stored registered users?')) return
  localStorage.removeItem('face_descriptors_v1')
  labeledDescriptors = []
  rebuildMatcher(); refreshRegisteredList(); setStatus('Cleared all stored data')
})

// Export / Import DB
exportBtn.addEventListener('click', ()=>{
  const raw = localStorage.getItem('face_descriptors_v1')
  if(!raw){ alert('No registered data to export'); return }
  const blob = new Blob([raw], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'face_db.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
})

importBtn.addEventListener('click', ()=> importFile.click())
importFile.addEventListener('change', async (e)=>{
  const f = importFile.files && importFile.files[0]
  if(!f) return
  try{
    const txt = await f.text()
    const parsed = JSON.parse(txt)
    // expect array of { label, descriptors: [ [numbers...] ] }
    if(!Array.isArray(parsed)) throw new Error('Invalid format')
    const incoming = jsonToDescriptors(parsed)
    // merge: if label exists append descriptors, else add
    for(const inc of incoming){
      const existing = labeledDescriptors.find(l=>l.label === inc.label)
      if(existing){ existing.descriptors.push(...inc.descriptors) }
      else labeledDescriptors.push(inc)
    }
    saveDescriptors(); rebuildMatcher(); refreshRegisteredList()
    setStatus('Imported ' + incoming.length + ' label(s)')
  }catch(err){
    console.error(err)
    alert('Import failed: ' + err.message)
  }finally{ importFile.value = '' }
})

// recognition
startRecBtn.addEventListener('click', async ()=>{
  if(!faceMatcher){ setStatus('No registered users. Register first.'); return }
  if(recognitionInterval) return
  try{
    if(!stream){
      stream = await navigator.mediaDevices.getUserMedia({ video:true })
      video.srcObject = stream
    }
    // wait for video to be ready to know dimensions
    await new Promise((res)=>{
      if(video.readyState >= 2 && video.videoWidth) return res()
      video.addEventListener('playing', ()=>res(), { once: true })
      // also fallback to loadedmetadata
      video.addEventListener('loadedmetadata', ()=>res(), { once: true })
    })
    overlay.width = video.videoWidth || 640
    overlay.height = video.videoHeight || 480
    setStatus('Recognition started')
    startRecBtn.disabled = true; stopRecBtn.disabled = false
    clickHint.style.display = 'block'
    recognitionInterval = setInterval(runRecognition, 220)
  }catch(e){
    console.error(e)
    setStatus('Camera permission required for recognition')
  }
})

stopRecBtn.addEventListener('click', ()=>{
  if(recognitionInterval){ clearInterval(recognitionInterval); recognitionInterval = null }
  startRecBtn.disabled = false; stopRecBtn.disabled = true
  ctx.clearRect(0,0,overlay.width,overlay.height)
  clickHint.style.display = 'none'
  setStatus('Recognition stopped')
})

async function runRecognition(){
  if(!faceMatcher) return
  const options = new faceapi.TinyFaceDetectorOptions()
  overlay.width = video.videoWidth
  overlay.height = video.videoHeight
  ctx.clearRect(0,0,overlay.width,overlay.height)
  // if server-based recognition is enabled, send a frame to the server and draw returned result
  if(useServerCheckbox && useServerCheckbox.checked && serverUrlInput && serverUrlInput.value){
    try{
      const c = document.createElement('canvas')
      c.width = overlay.width; c.height = overlay.height
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
      const blob = await new Promise(res=>c.toBlob(res, 'image/jpeg', 0.8))
      const fd = new FormData(); fd.append('snapshot', blob, 'frame.jpg')
      const upUrl = new URL('/recognize', serverUrlInput.value).toString()
      const r = await fetch(upUrl, { method: 'POST', body: fd })
      const json = await r.json()
      if(json && json.label){
        const b = json.box || { x:0,y:0,width:c.width,height:c.height }
        ctx.strokeStyle = json.label === 'unknown' ? 'red' : 'lime'
        ctx.lineWidth = 3
        ctx.strokeRect(b.x, b.y, b.width, b.height)
        const infoText = `${json.label} ${json.age?Math.round(json.age)+'y':''} ${json.gender||''}`.trim()
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(b.x, b.y + b.height - 28, Math.max(120, ctx.measureText(infoText).width+16), 28)
        ctx.fillStyle = '#fff'
        ctx.font = '14px sans-serif'
        ctx.fillText(infoText, b.x + 6, b.y + b.height - 10)
      }
    }catch(e){ console.error('Server recognize failed', e) }
    return
  }

  // local recognition fallback
  const detections = await faceapi.detectAllFaces(video, options).withFaceLandmarks().withFaceDescriptors().withAgeAndGender().withFaceExpressions()
  // store detections for click mapping
  overlay._lastDetections = detections
  detections.forEach(d=>{
    const best = faceMatcher.findBestMatch(d.descriptor)
    const { x, y, width, height } = d.detection.box
    // evaluate liveness (blink) using landmarks
    const alive = updateLiveness(d.landmarks)
    d._liveness = alive
    if(requireLiveness.checked && !alive){
      // indicate attention needed (not live)
      ctx.strokeStyle = 'orange'
    }else{
      ctx.strokeStyle = best.label === 'unknown' ? 'red' : 'lime'
    }
    ctx.lineWidth = 3
    ctx.strokeRect(x,y,width,height)
    // draw label + age/gender + dominant expression
    const labelText = best.toString()
    const ageText = d.age ? `${Math.round(d.age)}y` : ''
    const genderText = d.gender ? d.gender : ''
    const expr = d.expressions ? Object.entries(d.expressions).sort((a,b)=>b[1]-a[1])[0][0] : ''
    const infoText = `${labelText} ${ageText} ${genderText} ${expr}`.trim()
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(x, y+height-28, Math.max(120, ctx.measureText(infoText).width+16), 28)
    ctx.fillStyle = '#fff'
    ctx.font = '14px sans-serif'
    ctx.fillText(infoText, x+6, y+height-10)

    // if recognized and (liveness not required or live), send webhook + log, debounced per label
    try{
      if(best.label !== 'unknown' && (!requireLiveness.checked || d._liveness)){
        const key = `last_alert_${best.label}`
        const last = localStorage.getItem(key)
        const now = Date.now()
        if(!last || now - Number(last) > 30_000){ // 30s debounce
          localStorage.setItem(key, String(now))
          // capture snapshot of the face region
          const snapC = document.createElement('canvas')
          snapC.width = Math.round(width); snapC.height = Math.round(height)
          const sctx = snapC.getContext('2d')
          sctx.drawImage(video, x, y, width, height, 0, 0, snapC.width, snapC.height)
          const dataUrl = snapC.toDataURL('image/jpeg', 0.8)
          const payload = { time: new Date().toISOString(), label: best.label, confidence: best.distance, live: !!d._liveness, snapshot: dataUrl }
          sendWebhook(payload)
          pushLog({ time: new Date().toLocaleString(), event: 'recognized', label: best.label })
        }
      }
    }catch(e){ console.warn('alert send failed', e) }
  })
}

// click to identify
overlay.addEventListener('click', (e)=>{
  const rect = overlay.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (overlay.width / rect.width)
  const y = (e.clientY - rect.top) * (overlay.height / rect.height)
  const detections = overlay._lastDetections || []
  for(const d of detections){
    const b = d.detection.box
    if(x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height){
      const best = faceMatcher.findBestMatch(d.descriptor)
      showIdentification(best.label, best.distance)
      break
    }
  }
})

function showIdentification(name, distance){
  modalName.textContent = name === 'unknown' ? 'Unknown person' : name
  modalInfo.textContent = name === 'unknown' ? 'No strong match' : `Match confidence: ${ (1 - distance).toFixed(2) }`
  // try to show latest matching detection info (age/gender/expression)
  const dets = overlay._lastDetections || []
  const found = dets.find(d=> faceMatcher.findBestMatch(d.descriptor).label === name)
  if(found){
    const age = found.age ? Math.round(found.age) + ' years' : ''
    const gender = found.gender || ''
    const expr = found.expressions ? Object.entries(found.expressions).sort((a,b)=>b[1]-a[1])[0][0] : ''
    modalInfo.textContent += `\n${age} ${gender} ${expr}`
  }
  idModal.setAttribute('aria-hidden','false')
  // speak
  try{
    const utter = new SpeechSynthesisUtterance(modalName.textContent)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }catch(e){ console.warn('Speech failed', e) }
}

function hideIdentification(){
  idModal.setAttribute('aria-hidden','true')
}

modalClose.addEventListener('click', hideIdentification)
modalConfirm.addEventListener('click', hideIdentification)

// init on load
(async ()=>{
  await loadModels()
  // load stored descriptors
  const loaded = loadDescriptors()
  rebuildMatcher()
  refreshRegisteredList()
  setStatus('Ready')
})();
