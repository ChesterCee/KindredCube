@echo off
setlocal
cd /d "%~dp0api"
echo.
echo Starting KindredCube API...
echo.
echo Health check after startup:
echo   PC:    http://127.0.0.1:3001/v1/health
echo   Phone: http://172.20.10.2:3001/v1/health
echo.
echo Keep this window open while testing the app.
echo.
npm.cmd run build
if errorlevel 1 (
  echo.
  echo API build failed. Check the error above.
  pause
  exit /b 1
)
node dist/src/main.js
echo.
echo API stopped. Check the message above.
pause
