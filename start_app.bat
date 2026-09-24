@echo off
title PDF & Image Studio Launcher
echo ============================================================
echo Starting PDF & Image Studio (Backend + Frontend)...
echo ============================================================

if not exist "%~dp0backend\venv\Scripts\python.exe" (
    echo [ERROR] Backend virtual environment not found in %~dp0backend\venv!
    pause
    exit /b 1
)

echo [1/2] Starting FastAPI Backend (http://127.0.0.1:8000)...
start "PDF-Studio-Backend" /min cmd /c "cd /d "%~dp0backend" && venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Starting Vite Frontend (http://localhost:5173)...
start "PDF-Studio-Frontend" /min cmd /c "cd /d "%~dp0frontend" && npm run dev -- --host 0.0.0.0 --port 5173"

echo Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo Opening application in your default browser...
start http://localhost:5173

echo.
echo ============================================================
echo PDF & Image Studio is running!
echo Web UI:      http://localhost:5173
echo API Backend: http://127.0.0.1:8000
echo API Docs:    http://127.0.0.1:8000/docs
echo ============================================================
