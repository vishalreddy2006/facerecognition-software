@echo off
echo ========================================
echo   Starting Face Recognition Backend
echo ========================================
echo.

cd /d "%~dp0server"

echo Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo Node.js found: 
node --version
echo.

echo Installing dependencies...
call npm install
echo.

echo Starting server on port 3000...
echo.
node server-quick.js

pause
