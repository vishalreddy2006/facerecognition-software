# 🚀 QUICK DEPLOYMENT STEPS

## ⚠️ IMPORTANT: Deploy Order

1. **Backend FIRST** → Render (Node.js server)
2. **Frontend SECOND** → Netlify (Static site)

❌ **DO NOT** deploy backend to Netlify (it won't work!)

## Prerequisites
- GitHub account
- Render account (render.com) - for BACKEND
- Netlify account (netlify.com) - for FRONTEND only

## 10-Minute Deploy

### 1. Push to GitHub
```bash
git add .
git commit -m "Ready for deployment"
git push origin clean-rebuild
```

### 2. Deploy Backend (Render)
1. Go to render.com → New Web Service
2. Connect GitHub repo: `sky-watch`
3. Settings:
   - Build: `cd server && npm install`
   - Start: `node server/server-quick.js`
4. Deploy (wait 3 minutes)
5. Copy your backend URL

### 3. Update Frontend Config
Edit `scripts/config.js`:
```javascript
PRODUCTION_API: 'https://YOUR-RENDER-URL.onrender.com/api'
```
Push changes to GitHub.

### 4. Deploy Frontend (Netlify)
1. Go to netlify.com → New Site from Git
2. Connect GitHub repo: `sky-watch`
3. Deploy (wait 1 minute)
4. Copy your frontend URL

### 5. Update Backend CORS
In Render dashboard:
- Add environment variable: `FRONTEND_URL` = your Netlify URL
- Service will auto-redeploy

### 6. Test!
Open your Netlify URL and test face recognition!

## Detailed Guide
See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete instructions.

## URLs
- **Frontend**: `https://your-site.netlify.app`
- **Backend**: `https://your-app.onrender.com`

🎉 Your app is live!
