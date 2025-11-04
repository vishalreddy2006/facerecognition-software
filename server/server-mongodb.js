// Face Recognition Backend Server with MongoDB Cloud Database
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import face-api for server-side processing
const faceapi = require('@vladmandic/face-api');
const canvas = require('canvas');
const { Canvas, Image, ImageData } = canvas;

// Patch face-api to use node-canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/facerecognition';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ Connected to MongoDB Database'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema - Stores user data with photos, face descriptors, and expressions
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  photos: [{
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  descriptors: [[Number]], // Face descriptors for recognition
  expressions: [{
    expression: String, // happy, sad, angry, neutral, surprised, disgusted, fearful
    confidence: Number,
    detectedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Load face-api models
let modelsLoaded = false;
async function loadModels() {
  try {
    const modelsPath = path.join(__dirname, '../weights');
    console.log('Loading face-api models from:', modelsPath);
    
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelsPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
    await faceapi.nets.faceExpressionNet.loadFromDisk(modelsPath);
    await faceapi.nets.ageGenderNet.loadFromDisk(modelsPath);
    
    modelsLoaded = true;
    console.log('✅ Face-api models loaded successfully');
  } catch (error) {
    console.error('❌ Error loading models:', error);
    console.log('⚠️ Make sure to place the weights folder in the project root directory');
  }
}

// Initialize models on server start
loadModels();

// Helper: Process image and extract face data
async function processFaceImage(imagePath) {
  try {
    const img = await canvas.loadImage(imagePath);
    const detections = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor()
      .withFaceExpressions()
      .withAgeAndGender();

    if (!detections) {
      return { success: false, message: 'No face detected in image' };
    }

    // Get dominant expression
    const expressions = detections.expressions;
    const dominantExpression = Object.entries(expressions).reduce((a, b) => 
      expressions[a[0]] > expressions[b[0]] ? a : b
    );

    return {
      success: true,
      descriptor: Array.from(detections.descriptor),
      expression: dominantExpression[0],
      expressionConfidence: dominantExpression[1],
      age: Math.round(detections.age),
      gender: detections.gender,
      allExpressions: expressions
    };
  } catch (error) {
    console.error('Error processing face:', error);
    return { success: false, message: error.message };
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    modelsLoaded,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Register new user with photo
app.post('/api/register', upload.array('photos', 10), async (req, res) => {
  try {
    if (!modelsLoaded) {
      return res.status(503).json({ error: 'Models not loaded yet. Please wait.' });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one photo is required' });
    }

    // Process all uploaded photos
    const descriptors = [];
    const expressions = [];
    const photos = [];

    for (const file of req.files) {
      const photoUrl = `/uploads/${file.filename}`;
      const result = await processFaceImage(file.path);

      if (result.success) {
        descriptors.push(result.descriptor);
        expressions.push({
          expression: result.expression,
          confidence: result.expressionConfidence
        });
        photos.push({ url: photoUrl });
      } else {
        // Delete file if face not detected
        fs.unlinkSync(file.path);
      }
    }

    if (descriptors.length === 0) {
      return res.status(400).json({ error: 'No faces detected in any uploaded photos' });
    }

    // Check if user already exists
    let user = await User.findOne({ name });
    if (user) {
      // Update existing user
      user.photos.push(...photos);
      user.descriptors.push(...descriptors);
      user.expressions.push(...expressions);
      await user.save();
    } else {
      // Create new user
      user = new User({
        name,
        photos,
        descriptors,
        expressions
      });
      await user.save();
    }

    res.json({
      success: true,
      message: `Registered ${descriptors.length} photo(s) for ${name}`,
      user: {
        name: user.name,
        photoCount: user.photos.length,
        descriptorCount: user.descriptors.length,
        dominantExpression: expressions[0]?.expression
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Recognize face from uploaded photo
app.post('/api/recognize', upload.single('photo'), async (req, res) => {
  try {
    if (!modelsLoaded) {
      return res.status(503).json({ error: 'Models not loaded yet. Please wait.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Photo is required' });
    }

    // Process the uploaded photo
    const result = await processFaceImage(req.file.path);
    
    // Delete temporary file
    fs.unlinkSync(req.file.path);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get all users from database
    const users = await User.find({});
    if (users.length === 0) {
      return res.json({
        success: true,
        recognized: false,
        message: 'No users registered yet',
        expression: result.expression,
        expressionConfidence: result.expressionConfidence,
        age: result.age,
        gender: result.gender
      });
    }

    // Create labeled descriptors from database
    const labeledDescriptors = users.map(user => 
      new faceapi.LabeledFaceDescriptors(
        user.name,
        user.descriptors.map(desc => new Float32Array(desc))
      )
    );

    // Create face matcher
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    const match = faceMatcher.findBestMatch(new Float32Array(result.descriptor));

    let recognizedUser = null;
    if (match.label !== 'unknown') {
      // Update last seen
      recognizedUser = await User.findOneAndUpdate(
        { name: match.label },
        { 
          lastSeen: new Date(),
          $push: {
            expressions: {
              expression: result.expression,
              confidence: result.expressionConfidence
            }
          }
        },
        { new: true }
      );
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
      user: recognizedUser ? {
        name: recognizedUser.name,
        photoCount: recognizedUser.photos.length,
        lastSeen: recognizedUser.lastSeen,
        recentExpressions: recognizedUser.expressions.slice(-5)
      } : null
    });
  } catch (error) {
    console.error('Recognition error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all registered users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name photos.url expressions createdAt lastSeen');
    res.json({
      success: true,
      count: users.length,
      users: users.map(user => ({
        name: user.name,
        photoCount: user.photos.length,
        photos: user.photos.map(p => p.url),
        expressionHistory: user.expressions.slice(-10),
        createdAt: user.createdAt,
        lastSeen: user.lastSeen
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific user details
app.get('/api/users/:name', async (req, res) => {
  try {
    const user = await User.findOne({ name: req.params.name });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        name: user.name,
        photos: user.photos,
        photoCount: user.photos.length,
        descriptorCount: user.descriptors.length,
        expressionHistory: user.expressions,
        createdAt: user.createdAt,
        lastSeen: user.lastSeen
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/users/:name', async (req, res) => {
  try {
    const user = await User.findOne({ name: req.params.name });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user's photos from disk
    for (const photo of user.photos) {
      const photoPath = path.join(__dirname, photo.url);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    await User.deleteOne({ name: req.params.name });
    res.json({ success: true, message: `User ${req.params.name} deleted` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all data
app.delete('/api/clear-all', async (req, res) => {
  try {
    // Delete all photos
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      fs.unlinkSync(path.join(uploadsDir, file));
    }

    // Clear database
    await User.deleteMany({});
    res.json({ success: true, message: 'All data cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 Face Recognition Server Running                    ║
║                                                          ║
║   📡 Server: http://localhost:${PORT}                       ║
║   🗄️  Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}                              ║
║   🤖 AI Models: ${modelsLoaded ? 'Loaded' : 'Loading...'}                           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔴 Shutting down server...');
  await mongoose.connection.close();
  process.exit(0);
});
