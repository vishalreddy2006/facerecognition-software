# Server Archived

The Node/Express server in this folder is not used in the current configuration.

Current mode: Offline (client-only)
- All face data is stored locally in the browser (localStorage)
- No API calls or database connections are required
- See `OFFLINE-MODE.md` for usage

Re-enable the server later
1. Update `index.html` to load `scripts/main-api.js` instead of `scripts/main-local.js`.
2. Start the server:
   ```powershell
   cd server
   npm install
   node server-mongodb.js
   ```
3. Ensure the `.env` has a valid `MONGODB_URI` (local or MongoDB Atlas).
