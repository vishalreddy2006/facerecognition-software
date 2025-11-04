@echo off
echo ========================================
echo   Face Recognition - Universal Backend
echo ========================================
echo.
echo This version auto-connects to cloud database!
echo.

cd /d "%~dp0server"

echo Installing dependencies...
call npm install
echo.

echo Starting universal server...
echo.
node server-universal.js

pause
