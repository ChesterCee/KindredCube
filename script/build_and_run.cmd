@echo off
setlocal
cd /d "%~dp0\.."
set "MODE=%~1"
if "%MODE%"=="" set "MODE=start"
if /I "%MODE%"=="start" goto start
if /I "%MODE%"=="run" goto start
if /I "%MODE%"=="phone" goto phone
if /I "%MODE%"=="tunnel" goto tunnel
if /I "%MODE%"=="android" goto android
if /I "%MODE%"=="web" goto web
if /I "%MODE%"=="doctor" goto doctor
if /I "%MODE%"=="help" goto help
goto help_error

:start
call npx.cmd expo start --lan
exit /b %ERRORLEVEL%
:phone
call npx.cmd expo start --lan --clear
exit /b %ERRORLEVEL%
:tunnel
call npx.cmd expo start --tunnel --clear
exit /b %ERRORLEVEL%
:android
call npx.cmd expo start --android
exit /b %ERRORLEVEL%
:web
call npx.cmd expo start --web
exit /b %ERRORLEVEL%
:doctor
call npx.cmd expo-doctor
exit /b %ERRORLEVEL%
:help
echo Usage: script\build_and_run.cmd [start^|phone^|tunnel^|android^|web^|doctor^|help]
exit /b 0
:help_error
echo Unknown mode: %MODE%
goto help
