@echo off
title Publish New Converter Studio Version to GitHub
cd /d "%~dp0"
py backend\publish_release.py
pause
