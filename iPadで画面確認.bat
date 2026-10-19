@echo off
setlocal
cd /d "%~dp0"
title iPad Preview
cls
echo iPad preview launcher
echo.
echo This window should stay open.
echo Press any key to start the local preview server.
echo.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ipad-preview.ps1"
echo.
echo The preview server has stopped or failed.
echo Keep this window open and report the text above.
echo.
pause
