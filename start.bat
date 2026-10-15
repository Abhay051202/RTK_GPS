@echo off
title RTK Base Station // Python Backend + Frontend Launcher
echo ===================================================================
echo     STARTING INDUSTRIAL RTK BASE STATION COMMAND CENTER
echo ===================================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting Python Base Station GNSS Server (port 8000)...
start "RTK Python Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --host 0.0.0.0 --port 8000"

timeout /t 2 > nul

echo [2/2] Starting React Command Center UI (port 5173)...
start "RTK Frontend UI" cmd /k "cd /d "%~dp0" && npm run dev -- --host 127.0.0.1 --port 5173"

echo.
echo ===================================================================
echo Python Backend: http://127.0.0.1:8000/api/telemetry
echo Frontend Web UI: http://127.0.0.1:5173/
echo ===================================================================
echo.
pause
