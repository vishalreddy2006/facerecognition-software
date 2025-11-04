@echo off
echo.
echo ============================================
echo   Downloading AI Model Weights
echo ============================================
echo.
echo This will download face detection models
echo from GitHub (approximately 10MB)
echo.

set MODEL_DIR=weights
if not exist "%MODEL_DIR%" mkdir "%MODEL_DIR%"

echo Downloading models to %MODEL_DIR%\ folder...
echo.

echo [1/11] TinyFaceDetector model...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json' -OutFile '%MODEL_DIR%\tiny_face_detector_model-weights_manifest.json'"

echo [2/11] TinyFaceDetector shard 1...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1' -OutFile '%MODEL_DIR%\tiny_face_detector_model-shard1'"

echo [3/11] FaceLandmark68 model...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json' -OutFile '%MODEL_DIR%\face_landmark_68_model-weights_manifest.json'"

echo [4/11] FaceLandmark68 shard 1...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1' -OutFile '%MODEL_DIR%\face_landmark_68_model-shard1'"

echo [5/11] FaceRecognition model...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-weights_manifest.json' -OutFile '%MODEL_DIR%\face_recognition_model-weights_manifest.json'"

echo [6/11] FaceRecognition shard 1...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard1' -OutFile '%MODEL_DIR%\face_recognition_model-shard1'"

echo [7/11] FaceRecognition shard 2...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard2' -OutFile '%MODEL_DIR%\face_recognition_model-shard2'"

echo [8/11] FaceExpression model...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_expression_model-weights_manifest.json' -OutFile '%MODEL_DIR%\face_expression_model-weights_manifest.json'"

echo [9/11] FaceExpression shard 1...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_expression_model-shard1' -OutFile '%MODEL_DIR%\face_expression_model-shard1'"

echo [10/11] AgeGender model...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/age_gender_model-weights_manifest.json' -OutFile '%MODEL_DIR%\age_gender_model-weights_manifest.json'"

echo [11/11] AgeGender shard 1...
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/age_gender_model-shard1' -OutFile '%MODEL_DIR%\age_gender_model-shard1'"

echo.
echo ============================================
echo   Download Complete!
echo ============================================
echo.
echo All model files downloaded to %MODEL_DIR%\ folder
echo You can now start the backend server.
echo.
pause
