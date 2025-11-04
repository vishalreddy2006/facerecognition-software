// Universal Backend - Works on ANY platform with automatic database connection
// Supports: Render, Railway, Vercel, Netlify Functions, Heroku, etc.
// Database: Auto-connects to MongoDB Atlas (cloud) or uses JSON file as fallback

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8000';
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS - Works everywhere
const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? [FRONTEND_URL, /\.netlify\.app$/, /\.vercel\.app$/, /\.railway\.app$/, /\.render\.com$/] 
    : true,
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// File storage
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Fallback JSON database
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'users.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function loadJSONDB() {
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch (e) {
    return { users: {} };
  }
}

function saveJSONDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// Initialize database connection
let mongoConnected = false;
(async () => {
  await db.connectToMongoDB();
  mongoConnected = db.isMongoDBConnected();
  
  if (mongoConnected) {
    console.log('📦 Using MongoDB Atlas (Cloud Database)');
  } else {
    console.log('📦 Using JSON File Database (Local)');
  }
})();

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    modelsLoaded: true,
    database: mongoConnected ? 'mongodb' : 'json-file',
    environment: NODE_ENV
  });
});

// Register user
app.post('/api/register', upload.array('photos', 20), async (req, res) => {
  try {
    const { name, descriptors } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.files?.length) return res.status(400).json({ error: 'At least one photo is required' });

    const userData = {
      name,
      photos: req.files.map(f => ({
        url: `/uploads/${f.filename}`,
        uploadedAt: new Date()
      })),
      descriptors: descriptors ? JSON.parse(descriptors) : [],
      expressions: [],
      createdAt: new Date(),
      lastSeen: new Date()
    };

    if (mongoConnected) {
      // MongoDB
      await db.saveUser(userData);
    } else {
      // JSON file
      const jsonDB = loadJSONDB();
      jsonDB.users[name] = {
        ...userData,
        createdAt: userData.createdAt.toISOString(),
        lastSeen: userData.lastSeen.toISOString(),
        photos: userData.photos.map(p => ({
          ...p,
          uploadedAt: p.uploadedAt.toISOString()
        }))
      };
      saveJSONDB(jsonDB);
    }

    res.json({
      success: true,
      user: userData,
      photoCount: req.files.length
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    let users;
    
    if (mongoConnected) {
      // MongoDB
      const mongoUsers = await db.getAllUsers();
      users = mongoUsers.map(u => ({
        name: u.name,
        photoCount: u.photos?.length || 0,
        descriptors: u.descriptors || [],
        expressionHistory: u.expressions || [],
        createdAt: u.createdAt,
        lastSeen: u.lastSeen
      }));
    } else {
      // JSON file
      const jsonDB = loadJSONDB();
      users = Object.values(jsonDB.users).map(u => ({
        name: u.name,
        photoCount: u.photos?.length || 0,
        descriptors: u.descriptors || [],
        expressionHistory: u.expressions || [],
        createdAt: u.createdAt,
        lastSeen: u.lastSeen
      }));
    }

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/users/:name', async (req, res) => {
  try {
    const { name } = req.params;

    if (mongoConnected) {
      // MongoDB
      await db.deleteUser(name);
    } else {
      // JSON file
      const jsonDB = loadJSONDB();
      if (jsonDB.users[name]?.photos) {
        // Delete photos
        jsonDB.users[name].photos.forEach(p => {
          const photoPath = path.join(__dirname, p.url);
          if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
        });
      }
      delete jsonDB.users[name];
      saveJSONDB(jsonDB);
    }

    res.json({ success: true, message: `User ${name} deleted` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Log recognition event
app.post('/api/log-recognition', async (req, res) => {
  try {
    const { name, expression, age, gender } = req.body;

    if (mongoConnected) {
      // MongoDB
      await db.updateUserLastSeen(name, { emotion: expression, age, gender });
    } else {
      // JSON file
      const jsonDB = loadJSONDB();
      if (jsonDB.users[name]) {
        jsonDB.users[name].lastSeen = new Date().toISOString();
        if (!jsonDB.users[name].expressions) jsonDB.users[name].expressions = [];
        jsonDB.users[name].expressions.push({
          emotion: expression,
          age,
          gender,
          timestamp: new Date().toISOString()
        });
        saveJSONDB(jsonDB);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Log recognition error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear all data
app.delete('/api/clear-all', async (req, res) => {
  try {
    if (mongoConnected) {
      // MongoDB
      await db.clearAllUsers();
    } else {
      // JSON file
      const jsonDB = loadJSONDB();
      // Delete all photos
      Object.values(jsonDB.users).forEach(user => {
        if (user.photos) {
          user.photos.forEach(p => {
            const photoPath = path.join(__dirname, p.url);
            if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
          });
        }
      });
      saveJSONDB({ users: {} });
    }

    res.json({ success: true, message: 'All data cleared' });
  } catch (error) {
    console.error('Clear all error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Face Recognition Backend - UNIVERSAL`);
  console.log(`${'='.repeat(50)}\n`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📦 Database: ${mongoConnected ? 'MongoDB Atlas (Cloud)' : 'JSON File (Local)'}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`📸 Uploads: ${uploadsDir}`);
  console.log(`\n${'='.repeat(50)}\n`);
  
  if (!process.env.MONGODB_URI) {
    console.log('💡 TIP: Add MONGODB_URI environment variable for cloud database');
    console.log('   Get free MongoDB at: https://cloud.mongodb.com\n');
  }
});

server.on('error', (err) => {
  console.error('\n❌ Server failed to start:');
  console.error(err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n⏹️  Shutting down gracefully...');
  await db.closeConnection();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
