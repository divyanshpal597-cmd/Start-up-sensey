@echo off
rem Double-click to start Laptop Remote on Windows. The first start installs what it needs.
cd /d "%~dp0"
title Laptop Remote

where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo Python is not installed.
  echo Install it from https://www.python.org/downloads/ ^(tick "Add python.exe to PATH"^), then run this again.
  start https://www.python.org/downloads/
  pause
  exit /b 1
)

if not exist ".venv\ready" (
  echo First start: setting up. This takes a minute...
  %PY% -m venv .venv || goto :fail
  ".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r requirements.txt || goto :fail
  echo ok> ".venv\ready"
)
".venv\Scripts\python.exe" -m laptop_remote %*
pause
exit /b 0

:fail
echo.
echo Setup failed. Check your internet connection and try again.
pause
exit /b 1
