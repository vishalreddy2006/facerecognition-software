# ⚠️ SIMPLE FIX - "Cannot Connect to Server"

## The Problem
The backend server window gets closed accidentally, causing connection errors.

## The Solution (3 Steps)

### Step 1: Start Backend (KEEP THIS WINDOW OPEN!)
**Double-click:** `START-BACKEND.bat`

You'll see a GREEN window that says:
```
✅ Backend server running at http://localhost:3000
```

**⚠️ DO NOT CLOSE THIS WINDOW!**

### Step 2: Start Frontend
**Double-click:** `start-frontend.bat`

You'll see:
```
Serving HTTP on 0.0.0.0 port 8000
```

### Step 3: Open Browser
Go to: **http://localhost:8000**

Should see: **✅ Server connected**

---

## Still Shows "Cannot Connect"?

### Check 1: Is backend window still open?
- Look for the GREEN window titled "Backend Server"
- If closed, run `START-BACKEND.bat` again

### Check 2: Test backend directly
Open browser: http://localhost:3000/api/health

Should show:
```json
{"status":"ok","modelsLoaded":true,"database":"connected"}
```

### Check 3: Check browser console
1. Press **F12** in browser
2. Click **Console** tab
3. Look for error messages
4. You should see: `API Base URL: http://localhost:3000/api`

---

## Permanent Fix (After Deployment)

Once you deploy to **Render + Netlify**, you won't need to:
- ✅ Start backend manually (runs 24/7)
- ✅ Keep windows open (cloud hosting)
- ✅ Worry about connections (always available)

Just open your Netlify URL and it works! No more "Cannot connect" errors! 🎉

---

## Quick Checklist

Before using the app:
- [ ] Backend window is OPEN and shows "Backend server running"
- [ ] Frontend window shows "Serving HTTP on port 8000"
- [ ] Browser is open at http://localhost:8000
- [ ] Status bar shows "✅ Server connected"

✅ **If all checked, you're good to go!**
