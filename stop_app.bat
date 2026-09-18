@echo off
title Stop PDF & Image Studio
echo Stopping PDF & Image Studio servers...
powershell -Command "Get-Process -Name python, node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Converter*' -or $_.CommandLine -like '*5173*' -or $_.CommandLine -like '*8000*' } | Stop-Process -Force"
echo Done. Servers stopped.
timeout /t 2 >nul
