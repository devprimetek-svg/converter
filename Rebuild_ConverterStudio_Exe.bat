@echo off
title Rebuild ConverterStudio.exe
cd /d "%~dp0frontend"
echo [1/3] Building React Frontend...
call npm.cmd run build
if errorlevel 1 (
    echo Frontend build failed!
    pause
    exit /b 1
)

cd /d "%~dp0backend"
echo [2/3] Syncing Frontend Static Assets...
xcopy /E /I /Y "..\frontend\dist" "static" >nul

echo [3/3] Compiling Standalone Windowless ConverterStudio.exe with App Logo Icon...
py -m PyInstaller --noconfirm --onefile --noconsole --name "ConverterStudio" --icon="app\assets\app_icon.ico" --distpath ".." --add-data "static;static" --add-data "app\assets;app\assets" --add-data "..\version.json;." --add-data "..\app_config.json;." --hidden-import=uvicorn.logging --hidden-import=uvicorn.loops --hidden-import=uvicorn.loops.auto --hidden-import=uvicorn.protocols --hidden-import=uvicorn.protocols.http --hidden-import=uvicorn.protocols.http.auto --hidden-import=uvicorn.protocols.websockets --hidden-import=uvicorn.protocols.websockets.auto --hidden-import=uvicorn.lifespan --hidden-import=uvicorn.lifespan.on --hidden-import=multipart --hidden-import=python_multipart --hidden-import=pdfplumber --hidden-import=openpyxl --hidden-import=PIL --hidden-import=pypdf run_desktop.py

echo.
echo ============================================================
echo   SUCCESS! ConverterStudio.exe has been updated!
echo   Location: %~dp0ConverterStudio.exe
echo ============================================================
pause
