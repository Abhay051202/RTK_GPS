@echo off
setlocal
cd /d "%~dp0"
echo ===================================================================
echo     PROSPER CFS RTK BASE - Production v4.0
echo ===================================================================
echo.
if not exist "backend\.env" (
  echo ERROR: backend\.env is missing.
  echo Copy backend\.env.base.production.example to backend\.env and configure it.
  pause
  exit /b 1
)
cd /d "%~dp0backend"
python -m uvicorn main:app --host 0.0.0.0 --port 8000
