# How to Run Your Face Recognition Website

## What You Have
✅ A **free, local database** (NeDB) that saves to a file - NO external server or cloud account needed  
✅ Stores face data, photos, and expressions automatically  
✅ Works 100% on localhost - no internet required after first setup  

---

## Quick Start (2 Steps)

### Step 1: Start the Backend Server (with database)
1. Double-click **start-server.bat**
   - First time: automatically installs all needed packages
   - Creates database file: `server/data/users.db`
   - Starts at: http://localhost:3000

**You should see:**
```
🚀 Face Recognition (NeDB) running at http://localhost:3000
```

**Important:** Keep this window open while using the app!

### Step 2: Start the Website
1. Open Command Prompt
2. Run these commands:
```cmd
cd "c:\Users\k.vishal reddy\Pictures\FED FOLDER\face recognition software using web page"
python -m http.server 8000
```
   - Or double-click **start-frontend.bat**

3. Open your browser: **http://localhost:8000**

---

## How to Use

### Register a User (Save to Database)
1. Enter your name (e.g., "Vishal")
2. Upload a photo OR click "Use Camera" → "Capture Photo"
3. Click **"Save Label"**
   - ✅ Photo saved to database
   - ✅ Face data extracted and stored
   - ✅ Expression detected (happy/sad/etc.)

### Recognize Faces (From Database)
1. Click **"Start Recognition"**
2. Face the camera
3. **If matched:** Shows your name + **ACCESS GRANTED** banner
4. **If not matched:** Shows **ACCESS DENIED**

---

## Where is Data Stored?

Everything is saved locally in these folders:
- **Database file:** `server/data/users.db` (face descriptors, names, expressions)
- **Photos:** `server/uploads/` (actual image files)

No cloud. No external server. All on your computer.

---

## Troubleshooting

### "Cannot connect to server" error?
- Make sure **start-server.bat** is running
- Check: http://localhost:3000/api/health in browser
  - Should show: `{"status":"ok","database":"connected"}`

### "modelsLoaded": false?
- Download AI model files to `weights/` folder
- See QUICK-START.md for download instructions
- Restart start-server.bat after adding weights

### Port already in use?
- Close any other apps using port 3000 or 8000
- Or edit `server/.env` to change PORT

---

## What Makes This Different

❌ **No MongoDB setup**  
❌ **No cloud accounts**  
❌ **No external databases**  

✅ **Just run start-server.bat and it works!**  
✅ **Free NeDB database included**  
✅ **All data stays on your computer**  

Perfect for testing and local use! 🎉
