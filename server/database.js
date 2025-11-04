// MongoDB Cloud Database Connection
// Automatically connects to MongoDB Atlas (free tier)
// Falls back to JSON file if no MongoDB connection string provided

const { MongoClient } = require('mongodb');

let mongoClient = null;
let db = null;

// MongoDB connection string from environment variable
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function connectToMongoDB() {
  if (!MONGODB_URI) {
    console.log('⚠️  No MongoDB URI found. Using JSON file database.');
    return null;
  }

  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db('face-recognition');
    console.log('✅ Connected to MongoDB Atlas!');
    
    // Create indexes for better performance
    await db.collection('users').createIndex({ name: 1 }, { unique: true });
    
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('⚠️  Falling back to JSON file database.');
    return null;
  }
}

// User operations
async function saveUser(userData) {
  if (db) {
    // MongoDB
    await db.collection('users').updateOne(
      { name: userData.name },
      { $set: userData },
      { upsert: true }
    );
  }
  // JSON file handled by caller if db is null
}

async function getUser(name) {
  if (db) {
    return await db.collection('users').findOne({ name });
  }
  return null;
}

async function getAllUsers() {
  if (db) {
    return await db.collection('users').find({}).toArray();
  }
  return null;
}

async function deleteUser(name) {
  if (db) {
    await db.collection('users').deleteOne({ name });
  }
}

async function clearAllUsers() {
  if (db) {
    await db.collection('users').deleteMany({});
  }
}

async function updateUserLastSeen(name, expression) {
  if (db) {
    await db.collection('users').updateOne(
      { name },
      {
        $set: { lastSeen: new Date() },
        $push: {
          expressions: {
            emotion: expression.emotion || 'neutral',
            age: expression.age || 0,
            gender: expression.gender || 'unknown',
            timestamp: new Date()
          }
        }
      }
    );
  }
}

function isMongoDBConnected() {
  return db !== null;
}

async function closeConnection() {
  if (mongoClient) {
    await mongoClient.close();
    console.log('MongoDB connection closed');
  }
}

module.exports = {
  connectToMongoDB,
  saveUser,
  getUser,
  getAllUsers,
  deleteUser,
  clearAllUsers,
  updateUserLastSeen,
  isMongoDBConnected,
  closeConnection
};
