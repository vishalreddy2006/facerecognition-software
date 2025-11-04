// Backend with AI-powered face recognition
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const faceapi = require('@vladmandic/face-api');
const canvas = require('canvas');
const tf = require('@tensorflow/tfjs-node');

// Patch face-api to use node-canvas
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// AI Models
let modelsLoaded = false;
const MODEL_PATH = path.join(__dirname, '../weights');

async function loadModels() {
  try {
    console.log('Loading AI models...');
    await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH);
    await faceapi.nets.faceExpressionNet.loadFromDisk(MODEL_PATH);
    await faceapi.nets.ageGenderNet.loadFromDisk(MODEL_PATH);
    modelsLoaded = true;
    console.log('✅ AI models loaded successfully\n');
  } catch (error) {
    console.error('❌ Error loading models:', error.message);
    console.error('Please run download-ai-models.bat to download model files\n');
  }
}

// Load models on startup
loadModels();

// Data storage
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const dbFile = path.join(dataDir, 'users.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use('/uploads', express.static(uploadsDir));

// Simple JSON database
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch (e) {
    return { users: {} };
  }
}

function saveDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// Multer - increased limit to 20 photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB per file

// Helper: Extract face descriptor from image
async function extractFaceDescriptor(imagePath) {
  try {
    const img = await canvas.loadImage(imagePath);
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor()
      .withFaceExpressions()
      .withAgeAndGender();
    
    if (!detection) return null;
    
    return {
      descriptor: Array.from(detection.descriptor),
      expression: detection.expressions.asSortedArray()[0].expression,
      expressionConfidence: detection.expressions.asSortedArray()[0].probability,
      age: Math.round(detection.age),
      gender: detection.gender,
      genderConfidence: detection.genderProbability
    };
  } catch (error) {
    console.error('Face extraction error:', error.message);
    return null;
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', modelsLoaded, database: 'connected' });
});

// Register user with face descriptor extraction - increased to 20 photos
app.post('/api/register', upload.array('photos', 20), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.files?.length) return res.status(400).json({ error: 'At least one photo is required' });
    
    if (!modelsLoaded) {
      return res.status(503).json({ error: 'AI models not loaded. Please wait or check server logs.' });
    }

    const db = loadDB();
    if (!db.users[name]) {
      db.users[name] = {
        name,
        photos: [],
        descriptors: [],
        expressions: [],
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
    }

    let descriptorCount = 0;
    let dominantExpression = 'neutral';

    // Process each photo and extract face descriptors
    for (const f of req.files) {
      const photoPath = path.join(uploadsDir, f.filename);
      
      db.users[name].photos.push({
        url: `/uploads/${f.filename}`,
        uploadedAt: new Date().toISOString()
      });

      // Extract face descriptor
      const faceData = await extractFaceDescriptor(photoPath);
      if (faceData) {
        db.users[name].descriptors.push(faceData.descriptor);
        db.users[name].expressions.push({
          expression: faceData.expression,
          confidence: faceData.expressionConfidence,
          age: faceData.age,
          gender: faceData.gender,
          timestamp: new Date().toISOString()
        });
        dominantExpression = faceData.expression;
        descriptorCount++;
      }
    }

    db.users[name].lastSeen = new Date().toISOString();
    saveDB(db);

    res.json({
      success: true,
      message: `Registered ${req.files.length} photo(s) for ${name} (${descriptorCount} faces detected)`,
      user: {
        name,
        photoCount: db.users[name].photos.length,
        dominantExpression
      }
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Real face recognition with AI matching
app.post('/api/recognize', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Photo is required' });
    
    if (!modelsLoaded) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(503).json({ error: 'AI models not loaded yet' });
    }
    
    const photoPath = req.file.path;
    const db = loadDB();
    const userNames = Object.keys(db.users);
    
    if (!userNames.length) {
      try { fs.unlinkSync(photoPath); } catch (_) {}
      return res.json({
        success: true,
        recognized: false,
        message: 'No users registered yet'
      });
    }

    // Extract face from incoming photo
    const incomingFace = await extractFaceDescriptor(photoPath);
    
    // Clean up temp photo
    try { fs.unlinkSync(photoPath); } catch (_) {}
    
    if (!incomingFace) {
      return res.json({
        success: true,
        recognized: false,
        message: 'No face detected in image'
      });
    }

    // Build labeled face descriptors from database
    const labeledDescriptors = [];
    for (const userName of userNames) {
      const user = db.users[userName];
      if (user.descriptors && user.descriptors.length > 0) {
        const descriptors = user.descriptors.map(d => new Float32Array(d));
        labeledDescriptors.push(
          new faceapi.LabeledFaceDescriptors(userName, descriptors)
        );
      }
    }

    if (labeledDescriptors.length === 0) {
      return res.json({
        success: true,
        recognized: false,
        message: 'No face descriptors in database',
        expression: incomingFace.expression,
        expressionConfidence: incomingFace.expressionConfidence.toFixed(2),
        age: incomingFace.age,
        gender: incomingFace.gender
      });
    }

    // Create face matcher with threshold 0.6 (lower = stricter)
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    const incomingDescriptor = new Float32Array(incomingFace.descriptor);
    const bestMatch = faceMatcher.findBestMatch(incomingDescriptor);

    if (bestMatch.label !== 'unknown') {
      // Recognized user
      const userName = bestMatch.label;
      const distance = bestMatch.distance;
      const confidence = (1 - distance).toFixed(2);
      
      // Update last seen and add expression
      db.users[userName].lastSeen = new Date().toISOString();
      db.users[userName].expressions.push({
        expression: incomingFace.expression,
        confidence: incomingFace.expressionConfidence,
        age: incomingFace.age,
        gender: incomingFace.gender,
        timestamp: new Date().toISOString()
      });
      saveDB(db);
      
      res.json({
        success: true,
        recognized: true,
        name: userName,
        confidence,
        distance: distance.toFixed(2),
        expression: incomingFace.expression,
        expressionConfidence: (incomingFace.expressionConfidence * 100).toFixed(1),
        age: incomingFace.age,
        gender: incomingFace.gender,
        genderConfidence: (incomingFace.genderConfidence * 100).toFixed(1)
      });
    } else {
      // Unknown person - deny access
      res.json({
        success: true,
        recognized: false,
        message: 'Unknown person - Access Denied',
        expression: incomingFace.expression,
        expressionConfidence: (incomingFace.expressionConfidence * 100).toFixed(1),
        age: incomingFace.age,
        gender: incomingFace.gender,
        genderConfidence: (incomingFace.genderConfidence * 100).toFixed(1)
      });
    }
  } catch (e) {
    console.error('Recognize error:', e);
    res.status(500).json({ error: e.message });
  }
});

// List users
app.get('/api/users', (req, res) => {
  try {
    const db = loadDB();
    const users = Object.values(db.users).map(u => ({
      name: u.name,
      photoCount: u.photos.length,
      expressionHistory: u.expressions || [],
      createdAt: u.createdAt,
      lastSeen: u.lastSeen
    }));
    res.json({ success: true, count: users.length, users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete user
app.delete('/api/users/:name', (req, res) => {
  try {
    const db = loadDB();
    const user = db.users[req.params.name];
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete photos
    for (const p of user.photos) {
      const pth = path.join(__dirname, p.url);
      if (fs.existsSync(pth)) try { fs.unlinkSync(pth); } catch (_) {}
    }

    delete db.users[req.params.name];
    saveDB(db);
    res.json({ success: true, message: `User ${req.params.name} deleted` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear all
app.delete('/api/clear-all', (req, res) => {
  try {
    for (const f of fs.readdirSync(uploadsDir)) {
      try { fs.unlinkSync(path.join(uploadsDir, f)); } catch (_) {}
    }
    saveDB({ users: {} });
    res.json({ success: true, message: 'All data cleared' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Backend server running at http://localhost:${PORT}\n`);
  console.log(`📁 Database: ${dbFile}`);
  console.log(`📸 Photos: ${uploadsDir}\n`);
});
