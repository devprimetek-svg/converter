@echo off
title Build Converter Studio Windows Setup Installer
echo ============================================================
echo   Building Converter Studio Windows Setup Installer (.exe)
echo ============================================================
echo.

set "ISCC_PATH=C:\Users\Dawood\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC_PATH%" (
    set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)
if not exist "%ISCC_PATH%" (
    set "ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe"
)

"%ISCC_PATH%" "%~dp0converter_setup.iss"
if errorlevel 1 (
    echo.
    echo [ERROR] Setup build failed!
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   SUCCESS! Windows Setup Installer Created:
echo   %~dp0dist_installer\ConverterStudio_Setup_v2.6.12.exe
echo ============================================================
pause
