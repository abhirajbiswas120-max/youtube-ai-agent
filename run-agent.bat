@echo off
title YouTube AI Agent
color 0A

echo.
echo  ==========================================
echo   YouTube AI Agent — Launching...
echo  ==========================================
echo.

:: Change to the project directory (handles double-click from anywhere)
cd /d "%~dp0"

:: Check if node_modules exists; install if not
if not exist "node_modules\" (
    echo  [Setup] node_modules not found. Running npm install...
    echo.
    npm install
    echo.
)

:: Run the agent
echo  [Agent] Starting...
echo.
node index.js

echo.
if %ERRORLEVEL% EQU 0 (
    echo  ==========================================
    echo   SUCCESS! Check your inbox.
    echo  ==========================================
) else (
    echo  ==========================================
    echo   ERROR! See message above for details.
    echo  ==========================================
)

echo.
pause
