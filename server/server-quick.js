// Quick-start backend (works immediately, no AI dependencies needed)
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8000';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Simple CORS - Allow all origins in development, specific origins in production
const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? [FRONTEND_URL, /\.netlify\.app$/, /\.vercel\.app$/] 
    : true, // Allow all origins in development
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

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

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Mock emotion detection (will show different emotions for demo)
const emotions = ['happy', 'sad', 'angry', 'neutral', 'surprised', 'disgusted', 'fearful'];
function mockEmotionDetection() {
  const emotion = emotions[Math.floor(Math.random() * emotions.length)];
  const confidence = (Math.random() * 30 + 70).toFixed(1); // 70-100%
  const age = Math.floor(Math.random() * 30 + 18); // 18-48
  const gender = Math.random() > 0.5 ? 'male' : 'female';
  return { emotion, confidence, age, gender };
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', modelsLoaded: true, database: 'connected' });
});

// Register user with face descriptors
app.post('/api/register', upload.array('photos', 20), async (req, res) => {
  try {
    const { name, descriptors } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.files?.length) return res.status(400).json({ error: 'At least one photo is required' });

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

    // Parse descriptors from frontend
    if (descriptors) {
      try {
        const parsedDescriptors = JSON.parse(descriptors);
        db.users[name].descriptors = parsedDescriptors;
      } catch (e) {
        console.warn('Failed to parse descriptors:', e);
      }
    }
    
    for (const f of req.files) {
      db.users[name].photos.push({
        url: `/uploads/${f.filename}`,
        uploadedAt: new Date().toISOString()
      });
    }

    db.users[name].lastSeen = new Date().toISOString();
    saveDB(db);

    res.json({
      success: true,
      message: `Registered ${req.files.length} photo(s) for ${name}`,
      user: {
        name,
        photoCount: db.users[name].photos.length,
        descriptorCount: db.users[name].descriptors.length,
        dominantExpression: 'registered'
      }
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Recognize with emotion detection
app.post('/api/recognize', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Photo is required' });
    
    // Clean up temp photo
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    const db = loadDB();
    const userNames = Object.keys(db.users);
    
    const detected = mockEmotionDetection();
    const allEmotions = emotions.map(e => ({
      name: e,
      confidence: (Math.random() * 30 + 10).toFixed(1) + '%'
    }));
    // Make detected emotion have highest confidence
    allEmotions.find(e => e.name === detected.emotion).confidence = detected.confidence + '%';
    
    if (!userNames.length) {
      return res.json({
        success: true,
        recognized: false,
        message: 'No users registered yet',
        emotion: detected.emotion,
        emotionConfidence: detected.confidence,
        allEmotions,
        age: detected.age,
        gender: detected.gender,
        genderConfidence: '85.0'
      });
    }

    // Recognize the first registered user (for demo)
    const userName = userNames[0];
    db.users[userName].lastSeen = new Date().toISOString();
    db.users[userName].expressions.push({
      emotion: detected.emotion,
      confidence: detected.confidence,
      age: detected.age,
      gender: detected.gender,
      timestamp: new Date().toISOString()
    });
    saveDB(db);

    res.json({
      success: true,
      recognized: true,
      name: userName,
      confidence: '0.87',
      distance: 0.13,
      emotion: detected.emotion,
      emotionConfidence: detected.confidence,
      allEmotions,
      age: detected.age,
      gender: detected.gender,
      genderConfidence: '85.0',
      expression: detected.emotion,
      expressionConfidence: detected.confidence
    });
  } catch (e) {
    console.error('Recognize error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Log recognition event
app.post('/api/log-recognition', (req, res) => {
  try {
    const { name, expression, age, gender } = req.body;
    const db = loadDB();
    
    if (db.users[name]) {
      db.users[name].lastSeen = new Date().toISOString();
      if (!db.users[name].expressions) db.users[name].expressions = [];
      db.users[name].expressions.push({
        emotion: expression,
        age,
        gender,
        timestamp: new Date().toISOString()
      });
      saveDB(db);
    }
    
    res.json({ success: true });
  } catch (e) {
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
      descriptors: u.descriptors || [],
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

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Backend server running at http://localhost:${PORT}\n`);
  console.log(`📁 Database: ${dbFile}`);
  console.log(`📸 Photos: ${uploadsDir}`);
  console.log(`🎭 Emotion detection: Active (mock mode - install AI models for real detection)\n`);
});

server.on('error', (err) => {
  console.error('\n❌ Server failed to start:');
  console.error(err);
  process.exit(1);
});
