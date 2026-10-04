# YouTube AI Agent — PowerShell Launcher
# Right-click this file and choose "Run with PowerShell"

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "YouTube AI Agent"

Write-Host ""
Write-Host " ==========================================" -ForegroundColor Cyan
Write-Host "   YouTube AI Agent — Launching..." -ForegroundColor Cyan
Write-Host " ==========================================" -ForegroundColor Cyan
Write-Host ""

# Change to script directory
Set-Location $PSScriptRoot

# Auto-install dependencies if node_modules is missing
if (-not (Test-Path "node_modules")) {
    Write-Host " [Setup] node_modules not found. Running npm install..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

# Run the agent
Write-Host " [Agent] Starting..." -ForegroundColor Green
Write-Host ""

try {
    node index.js
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host " ==========================================" -ForegroundColor Green
        Write-Host "   SUCCESS! Check your inbox." -ForegroundColor Green
        Write-Host " ==========================================" -ForegroundColor Green
    } else {
        throw "Agent exited with code $LASTEXITCODE"
    }
} catch {
    Write-Host ""
    Write-Host " ==========================================" -ForegroundColor Red
    Write-Host "   ERROR: $_" -ForegroundColor Red
    Write-Host " ==========================================" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"
