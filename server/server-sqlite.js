// Face Recognition Backend Server with SQLite (zero-setup, free & open-source)
// This replaces MongoDB with a local SQLite database file for persistence.

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

// Face-api for server-side processing
const faceapi = require('@vladmandic/face-api');
const canvas = require('canvas');
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
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

// SQLite setup
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'facerecognition.db');
const db = new Database(dbPath);

// Create tables
// users(name unique), photos(user_id,url,uploadedAt), descriptors(user_id,vector JSON), expressions(user_id,expression,confidence,detectedAt)
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  lastSeen TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  uploadedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS descriptors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vector TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS expressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  expression TEXT,
  confidence REAL,
  detectedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Model loading
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
    console.error('❌ Failed to load models:', e.message);
  }
}
loadModels();

async function processFaceImage(imagePath) {
  try {
    const img = await canvas.loadImage(imagePath);
    const detections = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor()
      .withFaceExpressions()
      .withAgeAndGender();

    if (!detections) return { success: false, message: 'No face detected in image' };

    const expressions = detections.expressions || {};
    const dominant = Object.entries(expressions).reduce((a, b) => (a[1] > b[1] ? a : b), ['unknown', 0]);

    return {
      success: true,
      descriptor: Array.from(detections.descriptor),
      expression: dominant[0],
      expressionConfidence: dominant[1],
      age: Math.round(detections.age || 0),
      gender: detections.gender || 'unknown',
      allExpressions: expressions
    };
  } catch (e) {
    console.error('processFaceImage error:', e);
    return { success: false, message: e.message };
  }
}

// Helpers for DB
const getUserByName = db.prepare('SELECT * FROM users WHERE name = ?');
const insertUser = db.prepare('INSERT INTO users (name) VALUES (?)');
const updateLastSeen = db.prepare('UPDATE users SET lastSeen = CURRENT_TIMESTAMP WHERE id = ?');
const insertPhoto = db.prepare('INSERT INTO photos (user_id, url) VALUES (?, ?)');
const insertDescriptor = db.prepare('INSERT INTO descriptors (user_id, vector) VALUES (?, ?)');
const insertExpression = db.prepare('INSERT INTO expressions (user_id, expression, confidence) VALUES (?, ?, ?)');
const deleteUser = db.prepare('DELETE FROM users WHERE name = ?');
const listUsersStmt = db.prepare(`
  SELECT u.name,
         (SELECT COUNT(*) FROM photos p WHERE p.user_id = u.id) AS photoCount,
         u.createdAt, u.lastSeen
  FROM users u ORDER BY u.name`);
const getUserId = db.prepare('SELECT id FROM users WHERE name = ?');
const getAllUsersForMatch = db.prepare('SELECT id, name FROM users');
const getDescriptorsByUserId = db.prepare('SELECT vector FROM descriptors WHERE user_id = ?');
const getExpressionsByUserId = db.prepare('SELECT expression, confidence, detectedAt FROM expressions WHERE user_id = ? ORDER BY id DESC LIMIT 10');
const clearAllTables = db.prepare('DELETE FROM users'); // cascades due to FK on delete

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', modelsLoaded, database: fs.existsSync(dbPath) ? 'connected' : 'disconnected' });
});

app.post('/api/register', upload.array('photos', 10), async (req, res) => {
  try {
    if (!modelsLoaded) return res.status(503).json({ error: 'Models not loaded yet. Please wait.' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'At least one photo is required' });

    // Ensure user exists
    let user = getUserByName.get(name);
    if (!user) {
      insertUser.run(name);
      user = getUserByName.get(name);
    }

    const descriptors = []; const expressions = []; const photos = [];
    for (const f of req.files) {
      const photoUrl = `/uploads/${f.filename}`;
      const result = await processFaceImage(f.path);
      if (result.success) {
        insertPhoto.run(user.id, photoUrl);
        insertDescriptor.run(user.id, JSON.stringify(result.descriptor));
        insertExpression.run(user.id, result.expression, result.expressionConfidence);
        descriptors.push(result.descriptor);
        expressions.push({ expression: result.expression, confidence: result.expressionConfidence });
        photos.push({ url: photoUrl });
      } else {
        fs.unlinkSync(f.path);
      }
    }

    if (!descriptors.length) return res.status(400).json({ error: 'No faces detected in any uploaded photos' });

    res.json({
      success: true,
      message: `Registered ${descriptors.length} photo(s) for ${name}`,
      user: {
        name,
        photoCount: photos.length,
        descriptorCount: descriptors.length,
        dominantExpression: expressions[0]?.expression || 'unknown'
      }
    });
  } catch (e) {
    console.error('register error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/recognize', upload.single('photo'), async (req, res) => {
  try {
    if (!modelsLoaded) return res.status(503).json({ error: 'Models not loaded yet. Please wait.' });
    if (!req.file) return res.status(400).json({ error: 'Photo is required' });

    const result = await processFaceImage(req.file.path);
    fs.unlinkSync(req.file.path);
    if (!result.success) return res.status(400).json({ error: result.message });

    // Build labeled descriptors from DB
    const users = getAllUsersForMatch.all();
    if (!users.length) {
      return res.json({ success: true, recognized: false, message: 'No users registered yet', expression: result.expression, expressionConfidence: result.expressionConfidence, age: result.age, gender: result.gender });
    }

    const labeled = [];
    for (const u of users) {
      const rows = getDescriptorsByUserId.all(u.id);
      if (rows.length) {
        const arrays = rows.map(r => Float32Array.from(JSON.parse(r.vector)));
        labeled.push(new faceapi.LabeledFaceDescriptors(u.name, arrays));
      }
    }

    if (!labeled.length) {
      return res.json({ success: true, recognized: false, message: 'No descriptors stored yet', expression: result.expression, expressionConfidence: result.expressionConfidence, age: result.age, gender: result.gender });
    }

    const matcher = new faceapi.FaceMatcher(labeled, 0.6);
    const match = matcher.findBestMatch(Float32Array.from(result.descriptor));

    let user = null;
    if (match.label !== 'unknown') {
      const uid = getUserId.get(match.label)?.id;
      if (uid) {
        updateLastSeen.run(uid);
        insertExpression.run(uid, result.expression, result.expressionConfidence);
        user = { name: match.label, recentExpressions: getExpressionsByUserId.all(uid) };
      }
    }

    res.json({
      success: true,
      recognized: match.label !== 'unknown',
      name: match.label !== 'unknown' ? match.label : null,
      confidence: (1 - match.distance).toFixed(2),
      distance: match.distance,
      expression: result.expression,
      expressionConfidence: result.expressionConfidence.toFixed(2),
      age: result.age,
      gender: result.gender,
      allExpressions: result.allExpressions,
      user
    });
  } catch (e) {
    console.error('recognize error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users', (req, res) => {
  try {
    const rows = listUsersStmt.all();
    const users = rows.map(r => ({
      name: r.name,
      photoCount: r.photoCount,
      expressionHistory: getExpressionsByUserId.all(getUserId.get(r.name).id),
      createdAt: r.createdAt,
      lastSeen: r.lastSeen
    }));
    res.json({ success: true, count: users.length, users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/:name', (req, res) => {
  try {
    const u = getUserByName.get(req.params.name);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const uid = u.id;
    const photos = db.prepare('SELECT url, uploadedAt FROM photos WHERE user_id = ?').all(uid);
    const descCount = db.prepare('SELECT COUNT(*) as c FROM descriptors WHERE user_id = ?').get(uid).c;
    const expressions = getExpressionsByUserId.all(uid);
    res.json({ success: true, user: { name: u.name, photos, photoCount: photos.length, descriptorCount: descCount, expressionHistory: expressions, createdAt: u.createdAt, lastSeen: u.lastSeen } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:name', (req, res) => {
  try {
    const u = getUserByName.get(req.params.name);
    if (!u) return res.status(404).json({ error: 'User not found' });
    // Delete photos from disk as well
    const photos = db.prepare('SELECT url FROM photos WHERE user_id = ?').all(u.id);
    for (const p of photos) {
      const pth = path.join(__dirname, p.url);
      if (fs.existsSync(pth)) try { fs.unlinkSync(pth); } catch (_) {}
    }
    deleteUser.run(req.params.name);
    res.json({ success: true, message: `User ${req.params.name} deleted` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/clear-all', (req, res) => {
  try {
    // Delete upload files
    const files = fs.readdirSync(uploadsDir);
    for (const f of files) {
      try { fs.unlinkSync(path.join(uploadsDir, f)); } catch (_) {}
    }
    clearAllTables.run();
    res.json({ success: true, message: 'All data cleared' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Face Recognition (SQLite) running at http://localhost:${PORT}\n`);
});
