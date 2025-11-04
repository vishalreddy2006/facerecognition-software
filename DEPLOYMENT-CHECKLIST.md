# 🎯 DEPLOYMENT CHECKLIST

## Current Status
- [ ] Backend deployed to Render
- [ ] Frontend deployed to Netlify
- [ ] Frontend config updated with backend URL
- [ ] Backend CORS configured with frontend URL
- [ ] System tested and working

---

## ✅ Step 1: Deploy Backend to Render

**URL:** https://render.com

**What to do:**
1. Sign up with GitHub
2. New Web Service
3. Connect repository: `vishalreddy2006/sky-watch`
4. Branch: `clean-rebuild`
5. Build: `cd server && npm install`
6. Start: `node server/server-quick.js`
7. Add disk: 1GB at `/opt/render/project/src/server/uploads`
8. Deploy!

**Result:**
- ✅ Get backend URL: `https://xxx.onrender.com`
- ✅ Test: `https://xxx.onrender.com/api/health`

---

## ✅ Step 2: Update Frontend Config

**File to edit:** `scripts/config.js`

**Line 5 - Change this:**
```javascript
PRODUCTION_API: 'https://your-app-name.onrender.com/api',
```

**To your actual Render URL:**
```javascript
PRODUCTION_API: 'https://face-recognition-backend-xxxx.onrender.com/api',
```

**Then push to GitHub:**
```bash
git add scripts/config.js
git commit -m "Update production API URL"
git push origin clean-rebuild
```

---

## ✅ Step 3: Deploy Frontend to Netlify

**URL:** https://netlify.com

**What to do:**
1. New site from Git
2. Connect repository: `vishalreddy2006/sky-watch`
3. Branch: `clean-rebuild`
4. Build command: (leave empty)
5. Publish directory: `.` (dot means root)
6. Deploy!

**Result:**
- ✅ Get frontend URL: `https://xxx.netlify.app`

---

## ✅ Step 4: Update Backend CORS

**Go to Render Dashboard:**

1. Open your backend service
2. Environment tab
3. Edit `FRONTEND_URL` variable
4. Set to: `https://your-site.netlify.app`
5. Save (auto-redeploys)

---

## ✅ Step 5: Test Everything!

### Test 1: Backend Health
Open: `https://your-backend.onrender.com/api/health`

Should see:
```json
{"status":"ok","modelsLoaded":true,"database":"connected"}
```

### Test 2: Frontend Connection
Open: `https://your-site.netlify.app`

Should see:
- ✅ Status: "Server connected"
- ✅ AI models load successfully

### Test 3: Full Functionality
1. Register a user with photos
2. Start recognition
3. Test face detection

---

## 🎉 DONE!

Your system is now:
- ✅ Running 24/7
- ✅ Accessible worldwide
- ✅ Free HTTPS
- ✅ No local server needed!

Share your Netlify URL with anyone! 🚀

---

## 📝 Your URLs

**Backend (Render):**
```
https://_________________.onrender.com
```

**Frontend (Netlify):**
```
https://_________________.netlify.app
```

**Save these URLs!** You'll need them.

---

## 🆘 Having Issues?

Read the detailed guide: `DEPLOY-BACKEND-TO-RENDER.md`
