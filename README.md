Face Recognition Security Web App

Important: Offline Mode Active
This project is currently configured to run 100% in the browser (no central server). Data is stored locally in your browser. See OFFLINE-MODE.md for details.

The `server/` folder is archived and not required to run the app. You can re-enable it later if you want shared/cloud storage again.

Simple local web app using face-api.js that allows users to register by uploading images or capturing from camera, persists labeled face descriptors in localStorage, and runs live recognition in the browser.

How to use

1. Open `index.html` in a modern browser (Chrome/Edge/Firefox). For camera access, run from a secure context (file:// may work in some browsers, but prefer serving with a static file server).

2. Register a user:
   - Enter a name in the label field.
   - Upload one or more face photos or click "Use Camera" then "Capture Photo" to take samples.
   - Click "Save Label" to compute and store descriptors.

3. Start recognition:
   - Click "Start Recognition". The app will ask for camera permission if not already granted.
   - Faces that match stored labels will be shown with a green box and label. Unknown faces show red.

Notes & limitations

- This implementation stores data in localStorage and is suitable for small demos or offline setups. For a production security system you should store descriptors on a secure server and enforce authentication and encryption.
- Model files are loaded from CDN. For offline or secure deployments, host the weights locally.
- Accuracy depends on quality and number of samples per person.

Local weights (optional)


Quick steps:

1. Create a `weights/` folder next to `index.html`.
2. Download these files from the face-api.js repo (choose the exact versions matching the CDN):
   - `tiny_face_detector_model-weights_manifest.json` and related binary files
   - `face_landmark_68_model-weights_manifest.json` and related files
   - `face_recognition_model-weights_manifest.json` and related files

   You can fetch them from the CDN used in the app (replace version if needed):

   Example (one-liners using PowerShell or curl):

   PowerShell:
   ```powershell
   mkdir weights
   Invoke-WebRequest -OutFile weights\tiny_face_detector_model-weights_manifest.json https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights/tiny_face_detector_model-weights_manifest.json
   # repeat for other model files and binary shards
   ```

3. After placing the weights, reload the page. The app will display "Models loaded (local)" in the status if successful.

AI features added

- Age / Gender / Emotion: The app now loads `ageGenderNet` and `faceExpressionNet` and shows estimated age, gender and dominant facial expression on the overlay and in the identification modal. These models are optional but recommended for richer results.

Model files to include in `weights/` for these features:
 - `age_gender_model-weights_manifest.json` and its binary shards
 - `face_expression_model-weights_manifest.json` and its shards

Optional central server (archived)

For a more reliable, shared registry and to reduce client-side storage issues, a simple Node/Express server is included in the `server/` folder. It is currently archived/disabled. If you want to switch back to server mode, restore the script tag in `index.html` to use `scripts/main-api.js` and start the server as documented below. It exposes:
- GET /descriptors — returns stored descriptors
- POST /descriptors — overwrite stored descriptors (send JSON array)
- POST /log — append a log entry (receives webhook-style payloads)

To run the server locally:

1. Open a terminal in the `server/` folder.
2. Install dependencies and start:

```powershell
cd server
npm install
npm start
```

3. In the web UI, enable "Use central server for storage" and set Server URL to `http://localhost:3000`.

When enabled the frontend will load and save descriptors from the server and POST logs to `/log` when alerts fire.

Image uploads

When "Use central server" is enabled, snapshots are uploaded to the server `/upload` endpoint as multipart form files. The server saves images under `server/data/images` and returns a URL which is stored in the log entry. You can view saved images by visiting `http://localhost:3000/data/images/<filename>`.
