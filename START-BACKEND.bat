@echo off
title Backend Server - DO NOT CLOSE
color 0A
echo ================================================
echo   Backend Server - Persistent Mode
echo ================================================
echo.
echo This window MUST stay open for the server to work!
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0start-backend-persistent.ps1"
