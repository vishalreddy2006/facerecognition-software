# 🚀 GUARANTEED START GUIDE

## ⚠️ IMPORTANT: Follow this EXACT order every time

### Step 1: Start Backend (Terminal 1)

**Option A: PowerShell (RECOMMENDED - Always works)**
```powershell
cd "c:\Users\k.vishal reddy\Pictures\FED FOLDER\face recognition software using web page\server"
node server-quick.js
```

**Option B: Double-click batch file**
```
start-backend-reliable.bat
```

**What you should see:**
```
✅ Backend server running at http://localhost:3000
📁 Database: ...
📸 Photos: ...
```

**Verify it's working:**
Open browser: http://localhost:3000/api/health

Should show: `{"status":"ok","modelsLoaded":true,"database":"connected"}`

---

### Step 2: Start Frontend (Terminal 2)

**Option A: Python HTTP Server (RECOMMENDED)**
```bash
cd "c:\Users\k.vishal reddy\Pictures\FED FOLDER\face recognition software using web page"
python -m http.server 8000
```

**Option B: Double-click batch file**
```
start-frontend.bat
```

**What you should see:**
```
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/)
```

---

### Step 3: Open Application

Open browser: **http://localhost:8000**

**Status bar should show:**
- ✅ AI models loaded
- ✅ Server connected

**If you see "Cannot connect to server":**
1. Check backend terminal - should still be running
2. Check: http://localhost:3000/api/health in browser
3. If not working, close backend terminal and restart from Step 1

---

## 🔥 One-Command Startup (PowerShell)

Open PowerShell as Administrator and run:

```powershell
# Start backend in new window
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd ''c:\Users\k.vishal reddy\Pictures\FED FOLDER\face recognition software using web page\server''; node server-quick.js'

# Wait 3 seconds
Start-Sleep -Seconds 3

# Start frontend in new window
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd ''c:\Users\k.vishal reddy\Pictures\FED FOLDER\face recognition software using web page''; python -m http.server 8000'

# Open browser
Start-Sleep -Seconds 2
Start-Process "http://localhost:8000"
```

---

## 🐛 Troubleshooting

### Backend won't start:
```bash
# Kill any process on port 3000
netstat -ano | findstr :3000
# Find PID number, then kill it:
taskkill /F /PID <PID_NUMBER>

# Restart backend
cd server
node server-quick.js
```

### Frontend won't start:
```bash
# Kill any process on port 8000
netstat -ano | findstr :8000
# Find PID number, then kill it:
taskkill /F /PID <PID_NUMBER>

# Restart frontend
python -m http.server 8000
```

### "Cannot connect to server" error:
1. Backend must start FIRST
2. Wait 3-5 seconds before opening frontend
3. Check http://localhost:3000/api/health directly
4. If backend health check fails, restart backend

---

## ✅ Checklist Before Using

- [ ] Backend terminal is open and showing "Backend server running"
- [ ] Frontend terminal is open and showing "Serving HTTP"
- [ ] http://localhost:3000/api/health returns JSON
- [ ] http://localhost:8000 opens the application
- [ ] Status bar shows "Server connected"

---

## 📋 Quick Reference

| Component | Port | URL | Command |
|-----------|------|-----|---------|
| Backend   | 3000 | http://localhost:3000/api | `node server/server-quick.js` |
| Frontend  | 8000 | http://localhost:8000 | `python -m http.server 8000` |
| Health Check | 3000 | http://localhost:3000/api/health | Browser or curl |

---

## 🚀 After Deployment

Once deployed to Render + Netlify, you won't need to start anything manually!

- Backend: Runs 24/7 on Render (auto-starts)
- Frontend: Hosted on Netlify (always available)
- Just open your Netlify URL and it works!

No more "Cannot connect to server" errors in production! 🎉
