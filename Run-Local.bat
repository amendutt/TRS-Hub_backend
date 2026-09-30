@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\mysql2\promise.js" (
  echo Installing the project dependency...
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and retry.
    pause
    exit /b 1
  )
)
call npm.cmd start
pause
