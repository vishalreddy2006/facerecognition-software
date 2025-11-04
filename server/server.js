const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const multer = require('multer')

const app = express()
app.use(cors())
app.use(bodyParser.json({ limit: '20mb' }))

// optional server-side recognition: lazy load heavy libs
let faceapiServer = null
let tf = null
async function initServerFaceAPI(){
  if(faceapiServer) return
  try{
    tf = require('@tensorflow/tfjs-node')
    faceapiServer = require('@vladmandic/face-api')
    const modelPath = path.join(__dirname, '..', 'weights')
    // use loadFromDisk when available
    await faceapiServer.nets.ssdMobilenetv1.loadFromDisk(modelPath).catch(()=>{})
    await faceapiServer.nets.tinyFaceDetector.loadFromDisk(modelPath).catch(()=>{})
    await faceapiServer.nets.faceLandmark68Net.loadFromDisk(modelPath).catch(()=>{})
    await faceapiServer.nets.faceRecognitionNet.loadFromDisk(modelPath).catch(()=>{})
    await faceapiServer.nets.ageGenderNet.loadFromDisk(modelPath).catch(()=>{})
    await faceapiServer.nets.faceExpressionNet.loadFromDisk(modelPath).catch(()=>{})
    console.log('Server-side face-api initialized')
  }catch(e){
    console.error('Failed to init server-side face-api', e)
    faceapiServer = null
  }
}

const DATA_DIR = path.join(__dirname, 'data')
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR)
const IMAGES_DIR = path.join(DATA_DIR, 'images')
if(!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR)

const DESC_FILE = path.join(DATA_DIR, 'descriptors.json')
const LOG_FILE = path.join(DATA_DIR, 'logs.json')

function readJSON(file, fallback){
  try{ return JSON.parse(fs.readFileSync(file,'utf8')) }catch(e){ return fallback }
}

app.get('/descriptors', (req,res)=>{
  const data = readJSON(DESC_FILE, [])
  res.json(data)
})

app.post('/descriptors', (req,res)=>{
  const body = req.body
  if(!Array.isArray(body)) return res.status(400).json({ error: 'expected array' })
  // overwrite for now
  fs.writeFileSync(DESC_FILE, JSON.stringify(body, null, 2))
  res.json({ ok: true })
})

app.post('/log', (req,res)=>{
  const entry = req.body
  // if image data URI provided, ignore (frontend now uploads file to /upload)
  const logs = readJSON(LOG_FILE, [])
  logs.unshift(entry)
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(0,1000), null, 2))
  res.json({ ok: true })
})

// multipart upload endpoint for images
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, IMAGES_DIR) },
  filename: function (req, file, cb) {
    const name = `${Date.now()}-${Math.random().toString(36).slice(2,9)}${path.extname(file.originalname)}`
    cb(null, name)
  }
})
const upload = multer({ storage: storage })

app.post('/upload', upload.single('snapshot'), (req,res)=>{
  if(!req.file) return res.status(400).json({ error: 'no file' })
  const url = `/data/images/${req.file.filename}`
  // return URL (served statically)
  res.json({ ok: true, url })
})

// server-side recognition: accepts multipart image 'snapshot' and returns best match
app.post('/recognize', upload.single('snapshot'), async (req,res)=>{
  if(!req.file) return res.status(400).json({ error: 'no file' })
  await initServerFaceAPI()
  if(!faceapiServer) return res.status(500).json({ error: 'server face-api unavailable' })
  try{
    const canvas = require('canvas')
    const imgPath = path.join(IMAGES_DIR, req.file.filename)
    const img = await canvas.loadImage(imgPath)
    const c = canvas.createCanvas(img.width, img.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const detections = await faceapiServer.detectAllFaces(c).withFaceLandmarks().withFaceDescriptors().withAgeAndGender().withFaceExpressions()
    if(!detections || !detections.length) return res.json({ match: 'unknown' })
    const det = detections[0]
    const descriptor = det.descriptor
    // load stored descriptors
    const stored = readJSON(DESC_FILE, [])
    // build face matcher
    const labeled = stored.map(l=> new faceapiServer.LabeledFaceDescriptors(l.label, l.descriptors.map(d=> Float32Array.from(d))))
    const matcher = new faceapiServer.FaceMatcher(labeled, 0.6)
    const best = matcher.findBestMatch(descriptor)
    // also return box and age/gender/expressions
    const box = det.detection.box
    const age = det.age
    const gender = det.gender
    const expressions = det.expressions || {}
    res.json({ label: best.label, distance: best.distance, box: { x: box.x, y: box.y, width: box.width, height: box.height }, age, gender, expressions })
  }catch(e){ console.error('recognize failed', e); res.status(500).json({ error: 'recognize failed' }) }
})

// serve saved images statically
app.use('/data/images', express.static(IMAGES_DIR))

const port = process.env.PORT || 3000
app.listen(port, ()=> console.log('Server listening on', port))
