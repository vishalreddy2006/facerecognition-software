@echo off
echo.
echo ============================================
echo   Face Recognition Backend Server
echo ============================================
echo.

cd server

echo Installing/Updating dependencies...
call npm install
echo.

echo Starting server...
echo.
echo Server will run on http://localhost:3000
echo Press Ctrl+C to stop
echo.

node server-quick.js
