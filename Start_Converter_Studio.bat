@echo off
title Venture Automation - Converter Studio (Local Desktop)
cd /d "%~dp0"
if exist "frontend\dist" (
    xcopy /E /I /Y "frontend\dist" "backend\static" >nul 2>&1
)
cd /d "%~dp0backend"
py run_desktop.py
