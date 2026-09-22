# Powershell Live F&O Trading Launcher Script
# Run this script at 9:00 AM IST before market opens at 9:15 AM IST

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  ARTHA AI COPILOT — LIVE F&O SYSTEM LAUNCHER       " -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Start Artha API Server (Port 4000)
Write-Host "`n[1/3] Starting Express API Server on http://localhost:4000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm --prefix apps/api run start"

# 2. Start Web Frontend Dev Server (Port 5173)
Write-Host "[2/3] Starting Vite Web Dashboard on http://localhost:5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm --prefix apps/web run dev"

# 3. Start F&O Autonomous Paper Trading Engine (15-min auto-trade cycle)
$foServiceDir = "$PSScriptRoot\services\fo_data_service"
if (-not (Test-Path $foServiceDir)) { $foServiceDir = "C:\Users\bille\OneDrive\Documents\Desktop\fo_data_service" }
Write-Host "[3/3] Starting F&O Autonomous Paper Trading Engine (Angel One SmartAPI)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$foServiceDir'; `$env:Path = 'C:\Users\bille\.local\bin;' + `$env:Path; uv run main.py auto-trade"

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "  SYSTEM ONLINE! OPEN YOUR BROWSER AT:              " -ForegroundColor Green
Write-Host "  http://localhost:5173/fno                        " -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan
