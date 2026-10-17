@echo off
setlocal
cd /d "%~dp0"
start "Prosper RTK Base Backend" cmd /k "cd /d ""%~dp0backend"" && python -m uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 2 > nul
start "Prosper RTK Dashboard" cmd /k "cd /d ""%~dp0"" && npm run dev -- --host 0.0.0.0 --port 5173"
