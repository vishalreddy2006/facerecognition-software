@echo off
echo.
echo ============================================
echo   Face Recognition Frontend
echo ============================================
echo.
echo Starting frontend on http://localhost:8000
echo Open your browser and navigate to:
echo   http://localhost:8000
echo.
echo Press Ctrl+C to stop
echo.

python -m http.server 8000

REM If Python is not installed, uncomment the line below and comment the line above
REM npx http-server -p 8000
