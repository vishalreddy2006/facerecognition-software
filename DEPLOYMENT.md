# 🚀 Deployment Guide

This guide will help you deploy your Face Recognition Security System to production.

## Architecture

- **Frontend**: Deployed on Netlify (Static HTML/CSS/JS)
- **Backend**: Deployed on Render (Node.js API)

---

## Part 1: Deploy Backend to Render

### Step 1: Prepare Your Code

1. Make sure all changes are committed to GitHub:
```bash
git add .
git commit -m "Prepare for deployment"
git push origin clean-rebuild
```

### Step 2: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click "New +" → "Web Service"

### Step 3: Configure Render Service

1. **Connect Repository**: Select your `sky-watch` repository
2. **Settings**:
   - Name: `face-recognition-backend` (or any name)
   - Environment: `Node`
   - Branch: `clean-rebuild`
   - Build Command: `cd server && npm install`
   - Start Command: `node server/server-quick.js`
   
3. **Environment Variables**:
   Click "Advanced" → Add Environment Variables:
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - `FRONTEND_URL` = (Leave empty for now, add after deploying frontend)

4. **Disk Storage** (Optional but recommended):
   - Click "Add Disk"
   - Name: `uploads-disk`
   - Mount Path: `/opt/render/project/src/server/uploads`
   - Size: 1 GB

5. Click **"Create Web Service"**

### Step 4: Wait for Deployment

- Render will build and deploy your backend
- Wait 2-5 minutes
- You'll get a URL like: `https://face-recognition-backend-xxxx.onrender.com`

### Step 5: Test Backend

Open in browser: `https://your-backend-url.onrender.com/api/health`

Should see:
```json
{
  "status": "ok",
  "modelsLoaded": false,
  "database": "json-file"
}
```

✅ **Backend is live!**

---

## Part 2: Deploy Frontend to Netlify

### Step 1: Update Frontend Config

1. Open `scripts/config.js`
2. Update `PRODUCTION_API` with your Render backend URL:
```javascript
PRODUCTION_API: 'https://your-backend-url.onrender.com/api'
```

3. Commit changes:
```bash
git add scripts/config.js
git commit -m "Update production API URL"
git push
```

### Step 2: Create Netlify Account

1. Go to [netlify.com](https://www.netlify.com)
2. Sign up with GitHub
3. Click "Add new site" → "Import an existing project"

### Step 3: Configure Netlify

1. **Connect Repository**: Select your `sky-watch` repository
2. **Settings**:
   - Branch: `clean-rebuild`
   - Build command: (leave empty)
   - Publish directory: `.` (root directory)

3. Click **"Deploy site"**

### Step 4: Wait for Deployment

- Netlify will deploy in 1-2 minutes
- You'll get a URL like: `https://random-name-12345.netlify.app`

### Step 5: Update Backend CORS

1. Go back to Render dashboard
2. Open your backend service
3. Go to "Environment" tab
4. Update `FRONTEND_URL`:
   - Value: `https://your-netlify-url.netlify.app`
5. Save (service will redeploy)

### Step 6: Test Full System

1. Open your Netlify URL
2. You should see the face recognition interface
3. Check status bar - should connect to backend
4. Try registering a user
5. Try face recognition

✅ **Full system is live!**

---

## Part 3: Custom Domain (Optional)

### For Frontend (Netlify):
1. Netlify Dashboard → Domain Settings
2. Add custom domain
3. Update DNS records (Netlify provides instructions)

### For Backend (Render):
1. Render Dashboard → Settings → Custom Domain
2. Add your domain
3. Update DNS CNAME record

---

## Troubleshooting

### Backend not connecting:
- Check Render logs: Dashboard → Logs
- Verify environment variables are set
- Check CORS settings in `server-quick.js`

### Frontend not loading:
- Check browser console (F12)
- Verify `config.js` has correct backend URL
- Check Netlify deploy logs

### Face recognition not working:
- Check if AI models are loading (status bar)
- Open browser console for errors
- Verify camera permissions are granted

### 413 Payload Too Large error:
- Reduce photo size in registration
- Backend already configured for 50MB limit

---

## Free Tier Limits

### Render (Free):
- 750 hours/month runtime
- Sleeps after 15 minutes of inactivity (wakes up on request)
- 1 GB disk storage

### Netlify (Free):
- 100 GB bandwidth/month
- Unlimited sites
- Automatic HTTPS

---

## Maintenance

### Update Backend:
1. Make changes locally
2. Commit and push to GitHub
3. Render auto-deploys on new commits

### Update Frontend:
1. Make changes locally
2. Commit and push to GitHub
3. Netlify auto-deploys on new commits

---

## Important Notes

1. **Free tier sleep**: Render free tier sleeps after inactivity. First request after sleep takes 30-60 seconds to wake up.

2. **Data persistence**: With disk storage, your uploaded photos and user database persist across deploys.

3. **HTTPS**: Both Netlify and Render provide free HTTPS automatically.

4. **Camera access**: Browsers require HTTPS for camera access. Both platforms provide this automatically.

---

## Support

If you encounter issues:
1. Check browser console (F12 → Console)
2. Check Render logs (Dashboard → Logs)
3. Verify all environment variables are set correctly
4. Ensure both services are running

---

## Summary

✅ Backend on Render: Node.js API + Database + File Storage
✅ Frontend on Netlify: Static site with face-api.js
✅ Automatic deployments on git push
✅ Free HTTPS certificates
✅ Production-ready security

Your face recognition system is now accessible worldwide! 🌍
