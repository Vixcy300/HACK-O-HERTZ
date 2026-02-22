#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts the Incomiq backend + a Cloudflare Quick Tunnel.
    Auto-updates .env with the new public HTTPS URL so httpSMS webhook-info shows the correct URL.

.DESCRIPTION
    1. Downloads cloudflared.exe if not installed
    2. Kills any existing processes on port 8000
    3. Starts the FastAPI backend
    4. Starts a Cloudflare Quick Tunnel to port 8000
    5. Parses the tunnel URL from cloudflared output
    6. Updates backend/.env APP_BASE_URL with the new URL
    7. Sends a live reload signal to the backend
    8. Prints clear instructions for configuring httpSMS

.USAGE
    Right-click -> "Run with PowerShell"  (or: .\start-sms-tunnel.ps1)
#>

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND = Join-Path $ROOT "backend"
$ENV_FILE = Join-Path $BACKEND ".env"
$PYTHON = Join-Path $BACKEND "venv\Scripts\python.exe"
$CLOUDFLARED = Join-Path $env:TEMP "cloudflared.exe"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Incomiq SMS Tunnel Starter" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Download cloudflared if needed ──────────────────────────────────
if (-not (Test-Path $CLOUDFLARED)) {
    Write-Host "[1/5] Downloading cloudflared..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    try {
        Invoke-WebRequest -Uri $url -OutFile $CLOUDFLARED -UseBasicParsing -TimeoutSec 60
        Write-Host "      Downloaded to $CLOUDFLARED" -ForegroundColor Green
    } catch {
        Write-Host "      ERROR downloading cloudflared: $_" -ForegroundColor Red
        Write-Host "      Try manually: https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[1/5] cloudflared already present." -ForegroundColor Green
}

# ── Step 2: Kill any existing port 8000 processes ───────────────────────────
Write-Host "[2/5] Clearing port 8000..." -ForegroundColor Yellow
$pids8000 = (netstat -ano | findstr ":8000" | findstr "LISTENING") -replace '.*\s+(\d+)$','$1' | Select-Object -Unique
if ($pids8000) {
    $pids8000 | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
    Write-Host "      Killed PIDs: $pids8000" -ForegroundColor Green
} else {
    Write-Host "      Port 8000 is free." -ForegroundColor Green
}

# ── Step 3: Start backend ────────────────────────────────────────────────────
Write-Host "[3/5] Starting FastAPI backend..." -ForegroundColor Yellow
if (-not (Test-Path $PYTHON)) {
    Write-Host "      ERROR: Python venv not found at $PYTHON" -ForegroundColor Red
    exit 1
}
$backendJob = Start-Process -FilePath $PYTHON `
    -ArgumentList "-m uvicorn app.main:app --reload --port 8000 --host 0.0.0.0" `
    -WorkingDirectory $BACKEND `
    -PassThru -WindowStyle Minimized

Write-Host "      Backend PID: $($backendJob.Id)" -ForegroundColor Green
Write-Host "      Waiting for backend to start..." -ForegroundColor Gray
$maxWait = 15
$started = $false
for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) { $started = $true; break }
    } catch {}
    Write-Host "      ." -NoNewline -ForegroundColor Gray
}
Write-Host ""
if (-not $started) {
    Write-Host "      WARNING: Backend may not be ready yet, continuing..." -ForegroundColor Yellow
} else {
    Write-Host "      Backend is UP!" -ForegroundColor Green
}

# ── Step 4: Start cloudflare tunnel ─────────────────────────────────────────
Write-Host "[4/5] Starting Cloudflare Quick Tunnel..." -ForegroundColor Yellow
$tunnelLog = Join-Path $env:TEMP "cf-tunnel.log"

$cfProcess = Start-Process -FilePath $CLOUDFLARED `
    -ArgumentList "tunnel --url http://localhost:8000 --no-autoupdate --logfile `"$tunnelLog`"" `
    -PassThru -WindowStyle Minimized

Write-Host "      Cloudflare tunnel PID: $($cfProcess.Id)" -ForegroundColor Green
Write-Host "      Waiting for tunnel URL..." -ForegroundColor Gray

$tunnelUrl = $null
$maxAttempts = 30
for ($i = 0; $i -lt $maxAttempts; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "      ." -NoNewline -ForegroundColor Gray

    # Check log file
    if (Test-Path $tunnelLog) {
        $logContent = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
        if ($logContent -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]
            break
        }
    }

    # Also check stdout via alternate method
    $psOutput = & $CLOUDFLARED tunnel --url http://localhost:8000 --no-autoupdate 2>&1 | Select-String "trycloudflare.com" | Select-Object -First 1
    if ($psOutput -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
        $tunnelUrl = $Matches[0]
        break
    }
}
Write-Host ""

if (-not $tunnelUrl) {
    Write-Host "Trying alternate method to get tunnel URL..." -ForegroundColor Yellow
    # Read stderr from cloudflared directly
    $cfOutput = $null
    $job = Start-Job -ScriptBlock {
        param($cf)
        & $cf tunnel --url http://localhost:8000 --no-autoupdate 2>&1
    } -ArgumentList $CLOUDFLARED

    Start-Sleep -Seconds 8
    $cfOutput = Receive-Job $job -Keep 2>&1
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -ErrorAction SilentlyContinue

    if ($cfOutput -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
        $tunnelUrl = $Matches[0]
    }
}

if (-not $tunnelUrl) {
    Write-Host ""
    Write-Host "Could not auto-detect tunnel URL." -ForegroundColor Red
    Write-Host "Check cloudflare output and paste the URL manually in the app." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "[4/5] Tunnel URL: $tunnelUrl" -ForegroundColor Green

# ── Step 5: Update .env ──────────────────────────────────────────────────────
Write-Host "[5/5] Updating .env with new tunnel URL..." -ForegroundColor Yellow
if (Test-Path $ENV_FILE) {
    $envContent = Get-Content $ENV_FILE -Raw
    if ($envContent -match "APP_BASE_URL=") {
        $envContent = $envContent -replace "APP_BASE_URL=.*", "APP_BASE_URL=$tunnelUrl"
    } else {
        $envContent = $envContent.TrimEnd() + "`nAPP_BASE_URL=$tunnelUrl`n"
    }
    Set-Content $ENV_FILE $envContent -NoNewline
    Write-Host "      Updated .env: APP_BASE_URL=$tunnelUrl" -ForegroundColor Green
} else {
    Write-Host "      .env not found, creating..." -ForegroundColor Yellow
    "APP_BASE_URL=$tunnelUrl`nSMS_WEBHOOK_SECRET=incomiq-sms-secret-2024`n" | Set-Content $ENV_FILE
}

# Notify backend about the URL change (it will auto-reload with --reload flag)
try {
    $token_file = Join-Path $BACKEND "data\tokens.json"
    Invoke-RestMethod -Uri "http://localhost:8000/api/sms/update-tunnel-url" `
        -Method POST `
        -Body (ConvertTo-Json @{ url = $tunnelUrl }) `
        -ContentType "application/json" `
        -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
} catch {}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ALL DONE! Here's what to do next:" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  PUBLIC WEBHOOK URL (copy this):" -ForegroundColor White
Write-Host "  $tunnelUrl/api/sms/webhook" -ForegroundColor Cyan
Write-Host ""
Write-Host "  In httpSMS app (Android phone):" -ForegroundColor White
Write-Host "    Webhook URL : $tunnelUrl/api/sms/webhook" -ForegroundColor Yellow
Write-Host "    Header Name : X-Webhook-Secret" -ForegroundColor Yellow
Write-Host "    Header Value: incomiq-sms-secret-2024" -ForegroundColor Yellow
Write-Host ""
Write-Host "  IMPORTANT - Fix Android permissions:" -ForegroundColor Red
Write-Host "    1. Open httpSMS on your phone" -ForegroundColor White
Write-Host "    2. Tap the red warning / 'Missing Permission' banner" -ForegroundColor White
Write-Host "    3. Grant SMS Read + SMS Receive permissions" -ForegroundColor White
Write-Host "    4. Set httpSMS as DEFAULT SMS App (required!)" -ForegroundColor White
Write-Host "    5. Allow battery optimization exemption" -ForegroundColor White
Write-Host ""
Write-Host "  The app's SMS Alerts page will now show the correct URL." -ForegroundColor Gray
Write-Host "  Keep this window open while using SMS sync." -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to keep running (close window to stop tunnel)..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# ── Keep-Alive Loop with Auto-Restart ────────────────────────────────────────
Write-Host "Tunnel is running with AUTO-RESTART. Press Ctrl+C to stop." -ForegroundColor Cyan
Write-Host "If your laptop sleeps/wakes, the tunnel will auto-recover." -ForegroundColor Gray
Write-Host ""

function Restart-Tunnel {
    Write-Host ""
    Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Tunnel died — restarting..." -ForegroundColor Yellow

    # Kill old cloudflared
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Remove old log
    if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }

    # Start fresh tunnel
    $script:cfProcess = Start-Process -FilePath $CLOUDFLARED `
        -ArgumentList "tunnel --url http://localhost:8000 --no-autoupdate --logfile `"$tunnelLog`"" `
        -PassThru -WindowStyle Minimized

    # Wait for new URL
    $newUrl = $null
    for ($j = 0; $j -lt 30; $j++) {
        Start-Sleep -Seconds 1
        if (Test-Path $tunnelLog) {
            $logContent = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
            if ($logContent -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
                $newUrl = $Matches[0]
                break
            }
        }
    }

    if ($newUrl) {
        $script:tunnelUrl = $newUrl
        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] NEW tunnel URL: $newUrl" -ForegroundColor Green

        # Update .env
        if (Test-Path $ENV_FILE) {
            $envContent = Get-Content $ENV_FILE -Raw
            if ($envContent -match "APP_BASE_URL=") {
                $envContent = $envContent -replace "APP_BASE_URL=.*", "APP_BASE_URL=$newUrl"
            } else {
                $envContent = $envContent.TrimEnd() + "`nAPP_BASE_URL=$newUrl`n"
            }
            Set-Content $ENV_FILE $envContent -NoNewline
        }

        # Notify backend
        try {
            Invoke-RestMethod -Uri "http://localhost:8000/api/sms/update-tunnel-url" `
                -Method POST `
                -Body (ConvertTo-Json @{ url = $newUrl }) `
                -ContentType "application/json" `
                -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
        } catch {}

        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] .env + backend updated!" -ForegroundColor Green
        Write-Host "  IMPORTANT: Update httpSMS webhook URL to:" -ForegroundColor Red
        Write-Host "  $newUrl/api/sms/webhook" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Could not get new URL. Will retry in 30s..." -ForegroundColor Red
    }
}

# Health-check function: can we reach localhost:8000?
function Test-Backend {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        return $r.StatusCode -eq 200
    } catch { return $false }
}

$lastHealthy = Get-Date
while ($true) {
    Start-Sleep -Seconds 15

    # Check if cloudflared process died
    if ($cfProcess.HasExited) {
        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Cloudflared process EXITED." -ForegroundColor Red
        Restart-Tunnel
        $lastHealthy = Get-Date
        continue
    }

    # Check if backend is alive (it may have crashed too)
    if (-not (Test-Backend)) {
        $downFor = ((Get-Date) - $lastHealthy).TotalSeconds
        if ($downFor -gt 30) {
            Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Backend unreachable for ${downFor}s — may have crashed after sleep." -ForegroundColor Yellow
            # Try restarting backend
            $existingBackend = Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match "uvicorn" -or $true }
            if ($existingBackend) {
                Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Backend process found, checking tunnel..." -ForegroundColor Gray
            }
            # Restart tunnel regardless (it likely lost its connection after sleep)
            Restart-Tunnel
            $lastHealthy = Get-Date
        }
    } else {
        $lastHealthy = Get-Date
        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Alive: $tunnelUrl" -ForegroundColor DarkGray
    }
}
