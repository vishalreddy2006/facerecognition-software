# Offline Mode (Client-Only)

This project is now configured to run completely in the browser with no central server. All face data (descriptors and expression history) is stored locally in your browser using localStorage.

What changed
- No need to run the Node/Express server
- No MongoDB or API calls
- Models load from a public CDN
- The "Use central server for storage" UI is hidden automatically

How to run
1. Open `index.html` in a modern browser (Chrome/Edge/Firefox).
   - Tip: For best camera access support, serve the folder using a static server:

```powershell
# Windows PowerShell
cd "c:\Users\k.vishal reddy\Pictures\FED FOLDER\face recognition software using web page"
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

2. Register a user
   - Enter a name
   - Upload photos or click "Use Camera" then "Capture Photo"
   - Click "Save Label" to store descriptors locally

3. Start recognition
   - Click "Start Recognition" to use the camera
   - Detected faces are labeled if they match stored users

Data management
- Clear All: deletes all local data
- Export DB: downloads a JSON backup of your local database
- Import DB: restore from a previously exported JSON file

Notes
- Data lives only in the current browser and profile. To migrate, use Export/Import.
- Accuracy improves with multiple high-quality samples per user.
- For fully offline deployments without internet, host the face-api.js models locally instead of the CDN.
