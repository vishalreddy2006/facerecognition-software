# 🏗️ System Architecture

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       USER INTERFACE                             │
│  (Beautiful Frontend - index.html + main-api.js + styles.css)   │
│                                                                   │
│  • Upload/Capture Photos                                         │
│  • Start Recognition                                             │
│  • View Results                                                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ HTTP Requests (POST/GET)
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                   BACKEND SERVER                                 │
│              (server-mongodb.js - Port 3000)                     │
│                                                                   │
│  Endpoints:                                                      │
│  • POST /api/register  - Register user with photos              │
│  • POST /api/recognize - Recognize face from photo              │
│  • GET  /api/users     - Get all registered users               │
│  • DELETE /api/users/:name - Delete specific user               │
│                                                                   │
│  AI Processing:                                                  │
│  • face-api.js + TensorFlow.js                                  │
│  • Detects faces                                                 │
│  • Extracts 128-dim descriptors                                 │
│  • Detects expressions (happy/sad/angry/etc.)                   │
│  • Estimates age & gender                                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ MongoDB Driver
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│               MONGODB CLOUD DATABASE                             │
│                    (MongoDB Atlas)                               │
│                                                                   │
│  Collections:                                                    │
│  • users - Stores user data                                      │
│                                                                   │
│  Document Structure:                                             │
│  {                                                               │
│    name: "Vishal",                                              │
│    photos: [{ url: "/uploads/...", uploadedAt: Date }],        │
│    descriptors: [[0.123, 0.456, ...], [...]],                  │
│    expressions: [{                                               │
│      expression: "happy",                                        │
│      confidence: 0.95,                                           │
│      detectedAt: Date                                            │
│    }],                                                           │
│    createdAt: Date,                                              │
│    lastSeen: Date                                                │
│  }                                                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Registration Flow

```
USER ACTION                    FRONTEND                  BACKEND                    DATABASE
──────────────────────────────────────────────────────────────────────────────────────────

1. Enter name "Vishal"         
   Upload/Capture photos   →
                               
2. Click "Save Label"      →   Prepare FormData
                               name: "Vishal"
                               photos: [File, File]
                               
3.                         →   POST /api/register    →
                               
4.                                                    →  Load face-api models
                                                         
5.                                                    →  For each photo:
                                                         • Detect face
                                                         • Extract descriptor
                                                         • Detect expression
                                                         
6.                                                    →  Check if user exists  →
                                                         
7.                                                                              Create/Update
                                                                                user document
                                                                                
8.                                                    ← Return saved data     ←
                               
9.                        ←    { success: true,
                                 user: {
                                   name: "Vishal",
                                   photoCount: 2,
                                   dominantExpression: "happy"
                                 }
                               }
                               
10. Show success          ←    Display: "Registered Vishal - happy"
    Reload user list
```

---

## Recognition Flow

```
USER ACTION                    FRONTEND                  BACKEND                    DATABASE
──────────────────────────────────────────────────────────────────────────────────────────

1. Click "Start Recognition"
   Allow camera access    →
                               
2. Camera starts          →    Capture frame every 500ms
                               
3.                        →    Convert frame to JPEG
                               Create FormData
                               photo: Blob
                               
4.                        →    POST /api/recognize   →
                               
5.                                                    →  Load image
                                                         Detect face
                                                         Extract descriptor
                                                         Detect expression
                                                         
6.                                                    →  Get all users        →
                                                         from database
                                                         
7.                                                                              Return all users
                                                                                with descriptors
                                                                                
8.                                                    ←  Compare descriptor   ←
                                                         with all stored
                                                         Find best match
                                                         
9.                                                    →  Update lastSeen      →
                                                         Add expression log
                                                         
10.                                                                             Save updates
                                                                                
11.                                                   ← Return match data     ←
                               
12.                       ←    { recognized: true,
                                 name: "Vishal",
                                 confidence: 0.85,
                                 expression: "happy",
                                 age: 25,
                                 gender: "male"
                               }
                               
13. Draw green box        ←    Display: "Vishal - happy"
    Show label                 Speak: "Vishal, you look happy"
    Update status
```

---

## Technology Stack

### Frontend
- **HTML5** - Structure
- **CSS3** - Beautiful gradient styling with animations
- **JavaScript (ES6+)** - Core logic
- **Canvas API** - Video overlay
- **MediaDevices API** - Camera access
- **Speech Synthesis API** - Voice output
- **Fetch API** - Server communication

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Mongoose** - MongoDB ODM
- **Multer** - File upload handling
- **face-api.js (@vladmandic/face-api)** - Face detection & recognition
- **TensorFlow.js (tfjs-node)** - ML inference
- **canvas (node-canvas)** - Image processing

### Database
- **MongoDB Atlas** - Cloud database (free tier)
- **Schema**: Users with photos, descriptors, expressions

### AI Models
- **TinyFaceDetector** - Fast face detection
- **FaceLandmark68Net** - Facial landmarks (68 points)
- **FaceRecognitionNet** - Face embedding (128-dim)
- **FaceExpressionNet** - 7 emotions
- **AgeGenderNet** - Age & gender estimation

---

## Data Storage

### MongoDB Document Example

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Vishal",
  "photos": [
    {
      "url": "/uploads/1698765432123-abc123.jpg",
      "uploadedAt": "2025-10-29T10:30:00.000Z"
    },
    {
      "url": "/uploads/1698765432456-def456.jpg",
      "uploadedAt": "2025-10-29T10:30:05.000Z"
    }
  ],
  "descriptors": [
    [0.123, -0.456, 0.789, ...], // 128 numbers
    [0.234, -0.567, 0.890, ...]  // 128 numbers
  ],
  "expressions": [
    {
      "expression": "happy",
      "confidence": 0.95,
      "detectedAt": "2025-10-29T10:30:00.000Z"
    },
    {
      "expression": "neutral",
      "confidence": 0.87,
      "detectedAt": "2025-10-29T15:45:00.000Z"
    }
  ],
  "createdAt": "2025-10-29T10:30:00.000Z",
  "lastSeen": "2025-10-29T15:45:00.000Z"
}
```

### File System

```
project/
├── uploads/              # User photos stored here
│   ├── 1698765432123-abc123.jpg
│   ├── 1698765432456-def456.jpg
│   └── ...
│
└── weights/             # AI model files
    ├── tiny_face_detector_model-weights_manifest.json
    ├── tiny_face_detector_model-shard1
    ├── face_landmark_68_model-weights_manifest.json
    ├── face_landmark_68_model-shard1
    ├── face_recognition_model-weights_manifest.json
    ├── face_recognition_model-shard1
    ├── face_recognition_model-shard2
    ├── face_expression_model-weights_manifest.json
    ├── face_expression_model-shard1
    ├── age_gender_model-weights_manifest.json
    └── age_gender_model-shard1
```

---

## Performance Characteristics

- **Registration**: ~1-3 seconds per photo
- **Recognition**: ~500ms per frame
- **Database Query**: ~50-100ms
- **Face Detection**: ~100-200ms
- **Descriptor Extraction**: ~100-150ms
- **Expression Detection**: ~50-100ms

---

## Security Considerations

1. **Database**:
   - Use strong passwords
   - Enable IP whitelisting
   - Use connection string encryption

2. **Server**:
   - Validate all inputs
   - Sanitize file uploads
   - Rate limit API endpoints
   - Use HTTPS in production

3. **Frontend**:
   - Validate user inputs
   - Handle errors gracefully
   - Don't expose sensitive data

---

## Scalability

### Current Setup (Development)
- **Users**: Unlimited
- **Photos per user**: Unlimited
- **Concurrent recognition**: Limited by server resources

### Production Improvements
- **Load Balancer**: Distribute traffic
- **CDN**: Serve static files
- **Cloud Storage**: S3 for photos
- **Redis Cache**: Cache frequent queries
- **Horizontal Scaling**: Multiple server instances

---

**🚀 This architecture provides a robust, scalable, and maintainable face recognition system!**
