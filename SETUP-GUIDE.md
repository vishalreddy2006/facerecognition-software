# Face Recognition Security System with Cloud Database

Complete face recognition system with AI-powered expression detection, MongoDB cloud database, and beautiful modern UI.

## 🌟 Features

- ✅ **User Registration** - Upload or capture photos
- ✅ **Cloud Database Storage** - MongoDB stores all user data
- ✅ **Expression Detection** - AI detects happy, sad, angry, neutral, surprised, etc.
- ✅ **Live Recognition** - Real-time face recognition with webcam
- ✅ **Smart Matching** - Compares against cloud database
- ✅ **Expression History** - Tracks user emotions over time
- ✅ **Beautiful UI** - Modern gradient design with animations

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud - MongoDB Atlas free tier recommended)

### Step 1: Setup MongoDB Cloud Database (FREE)

1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create a free account
3. Create a new cluster (Free M0 tier)
4. Create a database user (username & password)
5. Whitelist your IP (or allow access from anywhere: 0.0.0.0/0)
6. Get your connection string (looks like):
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/facerecognition?retryWrites=true&w=majority
   ```

### Step 2: Install Backend

```cmd
cd server
npm install
```

### Step 3: Configure Database

Edit `server\.env` file:

```env
# For local MongoDB
MONGODB_URI=mongodb://localhost:27017/facerecognition

# OR for MongoDB Atlas Cloud (recommended)
MONGODB_URI=mongodb+srv://your-username:your-password@cluster0.xxxxx.mongodb.net/facerecognition?retryWrites=true&w=majority

PORT=3000
SERVER_URL=http://localhost:3000
```

### Step 4: Download AI Models (Required)

Download the face-api.js model weights:

1. Create a `weights` folder in the project root (next to `server` folder)
2. Download these files from https://github.com/vladmandic/face-api/tree/master/model:
   - `tiny_face_detector_model-weights_manifest.json` + binary shards
   - `face_landmark_68_model-weights_manifest.json` + binary shards
   - `face_recognition_model-weights_manifest.json` + binary shards
   - `face_expression_model-weights_manifest.json` + binary shards
   - `age_gender_model-weights_manifest.json` + binary shards

Or use this PowerShell script:

```powershell
mkdir weights
cd weights
$baseUrl = "https://raw.githubusercontent.com/vladmandic/face-api/master/model"
$models = @(
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model-shard1",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
  "face_expression_model-weights_manifest.json",
  "face_expression_model-shard1",
  "age_gender_model-weights_manifest.json",
  "age_gender_model-shard1"
)
foreach ($file in $models) {
  Invoke-WebRequest -Uri "$baseUrl/$file" -OutFile $file
}
cd ..
```

### Step 5: Start Backend Server

```cmd
cd server
npm start
```

You should see:
```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 Face Recognition Server Running                    ║
║                                                          ║
║   📡 Server: http://localhost:3000                       ║
║   🗄️  Database: Connected                              ║
║   🤖 AI Models: Loaded                                   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

### Step 6: Start Frontend

Open `index.html` in your browser. For best results, serve it with a local server:

```cmd
# Using Python
python -m http.server 8000

# Or using Node.js http-server
npx http-server -p 8000
```

Then open: http://localhost:8000

## 📖 How to Use

### Registering a User (Vishal Example)

1. **Enter Name**: Type "Vishal" in the name field
2. **Add Photos**:
   - Click "📁 Upload Photos" to select photos from computer
   - OR click "📷 Use Camera" then "📸 Capture Photo" to take live photos
3. **Save**: Click "💾 Save Label"
4. **AI Processing**: Server will:
   - Detect face in each photo
   - Extract face descriptors (128-dimensional vector)
   - Detect expression (happy/sad/angry/neutral/etc.)
   - Save everything to MongoDB cloud database

### Recognition

1. **Start**: Click "▶️ Start Recognition"
2. **Allow Camera**: Give browser camera permission
3. **Automatic Recognition**:
   - System captures frames every 500ms
   - Sends to server for processing
   - Server compares against database
   - Returns: Name, Expression, Age, Gender
4. **Display**: Shows green box if recognized, red if unknown
5. **Expression**: Real-time expression detection displayed

## 🎯 API Endpoints

### Health Check
```
GET /api/health
```

### Register User
```
POST /api/register
Body: FormData with 'name' and 'photos' (multiple files)
Response: { success: true, user: { name, photoCount, dominantExpression } }
```

### Recognize Face
```
POST /api/recognize
Body: FormData with 'photo' (single file)
Response: {
  recognized: true/false,
  name: "Vishal",
  expression: "happy",
  expressionConfidence: 0.95,
  age: 25,
  gender: "male"
}
```

### Get All Users
```
GET /api/users
Response: { users: [ { name, photoCount, expressionHistory } ] }
```

### Delete User
```
DELETE /api/users/:name
```

### Clear All Data
```
DELETE /api/clear-all
```

## 🗄️ Database Schema

```javascript
User {
  name: String (unique),
  photos: [{ url: String, uploadedAt: Date }],
  descriptors: [[Number]], // 128-dim vectors
  expressions: [{
    expression: String, // happy/sad/angry/neutral/surprised/disgusted/fearful
    confidence: Number,
    detectedAt: Date
  }],
  createdAt: Date,
  lastSeen: Date
}
```

## 🔧 Troubleshooting

### Models not loading
- Make sure `weights` folder is in project root
- Check console for error messages
- Verify all model files downloaded correctly

### Database connection failed
- Check MongoDB is running (local) or connection string (cloud)
- Verify username/password in connection string
- Check IP whitelist in MongoDB Atlas

### Camera not working
- Use HTTPS or localhost (required for camera access)
- Allow camera permissions in browser
- Check if another app is using the camera

### Server not starting
- Check if port 3000 is already in use
- Run: `netstat -ano | findstr :3000`
- Kill process or change PORT in .env

## 🎨 Customization

### Change Server URL
Update in `scripts/main-api.js`:
```javascript
const API_BASE_URL = 'https://your-server.com/api';
```

### Adjust Recognition Threshold
In `server/server-mongodb.js`, line with `FaceMatcher`:
```javascript
const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6); // Lower = stricter
```

### Change Recognition Speed
In `scripts/main-api.js`:
```javascript
recognitionInterval = setInterval(runRecognition, 500); // milliseconds
```

## 📊 Expression Types Detected

- 😊 **happy** - Smiling, positive
- 😢 **sad** - Frowning, negative
- 😠 **angry** - Angry expression
- 😐 **neutral** - No strong emotion
- 😲 **surprised** - Wide eyes, open mouth
- 🤢 **disgusted** - Disgust expression
- 😨 **fearful** - Fear expression

## 🔐 Production Deployment

1. **Secure MongoDB**: Use strong passwords, IP whitelisting
2. **HTTPS**: Use SSL certificates for production
3. **Environment Variables**: Never commit .env to git
4. **Rate Limiting**: Add rate limiting to API endpoints
5. **Authentication**: Add user authentication if needed
6. **Storage**: Consider using cloud storage (AWS S3) for photos

## 📝 License

MIT License - Feel free to use for personal and commercial projects!

## 🤝 Support

For issues or questions:
1. Check troubleshooting section
2. Verify server logs
3. Check browser console for errors

---

**Built with ❤️ using face-api.js, MongoDB, Express, and modern web technologies**
