@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-preview.ps1"
if errorlevel 1 (
  echo.
  echo The preview server stopped with an error. See the message above.
  pause
)
