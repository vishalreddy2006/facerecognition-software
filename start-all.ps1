# Face Recognition System - One-Click Startup
# This script starts both backend and frontend automatically

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Face Recognition System Startup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = "c:\Users\k.vishal reddy\Pictures\FED FOLDER\face recognition software using web page"

# Step 1: Start Backend
Write-Host "Step 1: Starting Backend Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$projectPath\server'; Write-Host 'Starting Backend...' -ForegroundColor Green; node server-quick.js"

# Wait for backend to initialize
Write-Host "Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verify backend is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "✓ Backend is running!" -ForegroundColor Green
} catch {
    Write-Host "✗ Backend failed to start!" -ForegroundColor Red
    Write-Host "Please check the backend terminal window for errors." -ForegroundColor Red
    pause
    exit
}

# Step 2: Start Frontend
Write-Host ""
Write-Host "Step 2: Starting Frontend Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$projectPath'; Write-Host 'Starting Frontend...' -ForegroundColor Green; python -m http.server 8000"

# Wait for frontend to start
Start-Sleep -Seconds 3

# Step 3: Open Browser
Write-Host ""
Write-Host "Step 3: Opening browser..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Start-Process "http://localhost:8000"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  ✓ System Started Successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can close this window." -ForegroundColor Gray
Write-Host ""
pause
