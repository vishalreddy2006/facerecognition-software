// Face Recognition Backend Server with NeDB (pure JS, zero setup)
// Persists to local files in ./data. Works on localhost without any DB install.

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Try to load tfjs-node (fast). If unavailable, fall back to @tensorflow/tfjs (slower, but no native deps)
let tf;
try { tf = require('@tensorflow/tfjs-node'); console.log('Using @tensorflow/tfjs-node'); } catch (e) {
  tf = require('@tensorflow/tfjs');
  console.log('Using @tensorflow/tfjs (fallback)');
}

const faceapi = require('@vladmandic/face-api');
const canvas = require('canvas');
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// NeDB (original package)
const Datastore = require('nedb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// NeDB setup (single collection with embedded arrays like Mongo)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const users = new Datastore({ filename: path.join(dataDir, 'users.db'), autoload: true });
users.ensureIndex({ fieldName: 'name', unique: true });

// Load models
let modelsLoaded = false;
async function loadModels() {
  try {
    const modelsPath = path.join(__dirname, '../weights');
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelsPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
    await faceapi.nets.faceExpressionNet.loadFromDisk(modelsPath);
    await faceapi.nets.ageGenderNet.loadFromDisk(modelsPath);
    modelsLoaded = true;
    console.log('✅ Face-api models loaded');
  } catch (e) {
    console.error('❌ Failed to load models:', e?.message || e);
  }
}
loadModels();

async function processFaceImage(imagePath) {
  try {
    const img = await canvas.loadImage(imagePath);
    const det = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor()
      .withFaceExpressions()
      .withAgeAndGender();
    if (!det) return { success: false, message: 'No face detected in image' };
    const expr = det.expressions || {};
    const dominant = Object.entries(expr).reduce((a, b) => (a[1] > b[1] ? a : b), ['unknown', 0]);
    return {
      success: true,
      descriptor: Array.from(det.descriptor),
      expression: dominant[0],
      expressionConfidence: dominant[1],
      age: Math.round(det.age || 0),
      gender: det.gender || 'unknown',
      allExpressions: expr
    };
  } catch (e) {
    console.error('processFaceImage error:', e);
    return { success: false, message: e.message };
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', modelsLoaded, database: 'connected' });
});

// Register user
app.post('/api/register', upload.array('photos', 10), async (req, res) => {
  try {
    if (!modelsLoaded) return res.status(503).json({ error: 'Models not loaded yet. Please wait.' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.files?.length) return res.status(400).json({ error: 'At least one photo is required' });

    // Upsert user
    const found = await users.asyncFindOne({ name });
    let userDoc = found || { name, photos: [], descriptors: [], expressions: [], createdAt: new Date(), lastSeen: new Date() };

    const descriptors = []; const expressions = []; const photos = [];
    for (const f of req.files) {
      const photoUrl = `/uploads/${f.filename}`;
      const result = await processFaceImage(f.path);
      if (result.success) {
        photos.push({ url: photoUrl, uploadedAt: new Date() });
        descriptors.push(result.descriptor);
        expressions.push({ expression: result.expression, confidence: result.expressionConfidence, detectedAt: new Date() });
      } else {
        try { fs.unlinkSync(f.path); } catch (_) {}
      }
    }

    if (!descriptors.length) return res.status(400).json({ error: 'No faces detected in any uploaded photos' });

    userDoc.photos.push(...photos);
    userDoc.descriptors.push(...descriptors);
    userDoc.expressions.push(...expressions);
    userDoc.lastSeen = new Date();

    if (found) {
      await users.asyncUpdate({ _id: found._id }, { $set: userDoc }, {});
    } else {
      await users.asyncInsert(userDoc);
    }

    res.json({ success: true, message: `Registered ${descriptors.length} photo(s) for ${name}` , user: { name, photoCount: userDoc.photos.length, descriptorCount: userDoc.descriptors.length, dominantExpression: expressions[0]?.expression || 'unknown' } });
  } catch (e) {
    console.error('register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Recognize
app.post('/api/recognize', upload.single('photo'), async (req, res) => {
  try {
    if (!modelsLoaded) return res.status(503).json({ error: 'Models not loaded yet. Please wait.' });
    if (!req.file) return res.status(400).json({ error: 'Photo is required' });
    const result = await processFaceImage(req.file.path);
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    if (!result.success) return res.status(400).json({ error: result.message });

    const all = await users.asyncFind({});
    if (!all.length) return res.json({ success: true, recognized: false, message: 'No users registered yet', expression: result.expression, expressionConfidence: result.expressionConfidence, age: result.age, gender: result.gender });

    // Build matcher
    const labeled = [];
    for (const u of all) {
      if (u.descriptors?.length) {
        const arrs = u.descriptors.map(v => Float32Array.from(v));
        labeled.push(new faceapi.LabeledFaceDescriptors(u.name, arrs));
      }
    }
    if (!labeled.length) return res.json({ success: true, recognized: false, message: 'No descriptors stored yet', expression: result.expression, expressionConfidence: result.expressionConfidence, age: result.age, gender: result.gender });

    const matcher = new faceapi.FaceMatcher(labeled, 0.6);
    const match = matcher.findBestMatch(Float32Array.from(result.descriptor));

    let user = null;
    if (match.label !== 'unknown') {
      const found = await users.asyncFindOne({ name: match.label });
      if (found) {
        found.lastSeen = new Date();
        found.expressions.push({ expression: result.expression, confidence: result.expressionConfidence, detectedAt: new Date() });
        await users.asyncUpdate({ _id: found._id }, { $set: found }, {});
        user = { name: found.name, recentExpressions: found.expressions.slice(-5) };
      }
    }

    res.json({ success: true, recognized: match.label !== 'unknown', name: match.label !== 'unknown' ? match.label : null, confidence: (1 - match.distance).toFixed(2), distance: match.distance, expression: result.expression, expressionConfidence: result.expressionConfidence.toFixed(2), age: result.age, gender: result.gender, allExpressions: result.allExpressions, user });
  } catch (e) {
    console.error('recognize error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Users list
app.get('/api/users', async (req, res) => {
  try {
    const all = await users.asyncFind({}).sort((a,b)=> a.name.localeCompare(b.name));
    const mapped = all.map(u => ({ name: u.name, photoCount: u.photos?.length || 0, photos: (u.photos||[]).map(p=>p.url), expressionHistory: (u.expressions||[]).slice(-10), createdAt: u.createdAt, lastSeen: u.lastSeen }));
    res.json({ success: true, count: mapped.length, users: mapped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/:name', async (req, res) => {
  try {
    const u = await users.asyncFindOne({ name: req.params.name });
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: { name: u.name, photos: u.photos || [], photoCount: (u.photos||[]).length, descriptorCount: (u.descriptors||[]).length, expressionHistory: u.expressions || [], createdAt: u.createdAt, lastSeen: u.lastSeen } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:name', async (req, res) => {
  try {
    const u = await users.asyncFindOne({ name: req.params.name });
    if (!u) return res.status(404).json({ error: 'User not found' });
    // delete photos from disk
    for (const p of (u.photos||[])) {
      const pth = path.join(__dirname, p.url);
      if (fs.existsSync(pth)) { try { fs.unlinkSync(pth); } catch(_){} }
    }
    await users.asyncRemove({ _id: u._id }, {});
    res.json({ success: true, message: `User ${req.params.name} deleted` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/clear-all', async (req, res) => {
  try {
    // delete uploads
    for (const f of fs.readdirSync(uploadsDir)) { try { fs.unlinkSync(path.join(uploadsDir, f)); } catch (_) {} }
    await users.asyncRemove({}, { multi: true });
    res.json({ success: true, message: 'All data cleared' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Face Recognition (NeDB) running at http://localhost:${PORT}\n`);
});
