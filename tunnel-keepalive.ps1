# Incomiq Tunnel Keepalive — ngrok
# Keeps SMS webhook alive. Uses permanent static domain if configured,
# otherwise uses dynamic ngrok URL and auto-updates backend on each restart.
# Run: .\tunnel-keepalive.ps1

$ROOT      = Split-Path -Parent $MyInvocation.MyCommand.Path
$ENV_FILE  = Join-Path $ROOT "backend\.env"
$CFG_FILE  = Join-Path $ROOT ".ngrok-config"
$NGROK     = "$env:TEMP\ngrok.exe"
$port      = 8000

# Load static domain from config if available
$staticDomain = $null
if (Test-Path $CFG_FILE) {
    $cfg = @{}
    Get-Content $CFG_FILE | Where-Object { $_ -match "=" -and $_ -notmatch "^#" } | ForEach-Object {
        $p = $_ -split "=", 2; $cfg[$p[0].Trim()] = $p[1].Trim()
    }
    $staticDomain = $cfg["NGROK_DOMAIN"]
}

if ($staticDomain) {
    Write-Host "=== Incomiq Tunnel (PERMANENT: $staticDomain) ===" -ForegroundColor Cyan
} else {
    Write-Host "=== Incomiq Tunnel (dynamic URL — run setup-ngrok.ps1 for permanent URL) ===" -ForegroundColor Yellow
}
Write-Host ""

function Sync-Url($url) {
    # Update .env
    if (Test-Path $ENV_FILE) {
        $c = Get-Content $ENV_FILE -Raw
        $c = $c -replace "APP_BASE_URL=.*", "APP_BASE_URL=$url"
        Set-Content $ENV_FILE $c -NoNewline
    }
    # Notify backend
    try {
        Invoke-RestMethod -Uri "http://localhost:$port/api/sms/update-tunnel-url" `
            -Method POST -Body (ConvertTo-Json @{ url = $url }) `
            -ContentType "application/json" -UseBasicParsing -TimeoutSec 5 | Out-Null
    } catch {}
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Webhook: $url/api/sms/webhook" -ForegroundColor Green
}

function Test-Tunnel($url) {
    try {
        $null = Invoke-WebRequest -Uri "$url/api/sms/webhook" -Method GET -UseBasicParsing -TimeoutSec 8
        return $true
    } catch {
        return ($_.Exception.Response.StatusCode.value__ -ge 400 -and $_.Exception.Response.StatusCode.value__ -lt 500)
    }
}

function Get-NgrokUrl {
    try {
        $info = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 5
        return ($info.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1 -ExpandProperty public_url)
    } catch { return $null }
}

while ($true) {
    Get-Process -Name "ngrok" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1

    # Start ngrok — with static domain if configured, otherwise dynamic
    if ($staticDomain) {
        $args = "http $port --domain=$staticDomain"
    } else {
        $args = "http $port"
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting ngrok..." -ForegroundColor Cyan
    $proc = Start-Process -FilePath $NGROK -ArgumentList $args -PassThru -WindowStyle Minimized

    # Wait for tunnel URL
    $tunnelUrl = $null
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 2
        if ($staticDomain) {
            if (Test-Tunnel "https://$staticDomain") { $tunnelUrl = "https://$staticDomain"; break }
        } else {
            $tunnelUrl = Get-NgrokUrl
            if ($tunnelUrl) { break }
        }
    }

    if ($tunnelUrl) {
        Sync-Url $tunnelUrl
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Could not get URL, retrying..." -ForegroundColor Red
        if (-not $proc.HasExited) { $proc | Stop-Process -Force }
        Start-Sleep -Seconds 5
        continue
    }

    # Health monitor every 30s
    $fails = 0
    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 30
        if (Test-Tunnel $tunnelUrl) {
            $fails = 0
            Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] OK" -ForegroundColor DarkGray
        } else {
            $fails++
            Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Unreachable ($fails/2)" -ForegroundColor Yellow
            if ($fails -ge 2) { $proc | Stop-Process -Force; break }
        }
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Restarting in 3s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}

$port = 8000
$CLOUDFLARED = Join-Path $env:TEMP "cloudflared.exe"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$ENV_FILE = Join-Path $ROOT "backend\.env"
$tunnelLog = Join-Path $env:TEMP "cf-tunnel-keepalive.log"

# Download cloudflared if needed
if (-not (Test-Path $CLOUDFLARED)) {
    Write-Host "Downloading cloudflared..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $url -OutFile $CLOUDFLARED -UseBasicParsing -TimeoutSec 60
}

Write-Host "Starting tunnel keepalive (Cloudflare) -> localhost:$port" -ForegroundColor Cyan
Write-Host "Auto-restarts on crash, sleep/wake, etc." -ForegroundColor Gray
Write-Host ""

while ($true) {
    # Kill old cloudflared processes
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting Cloudflare tunnel -> localhost:$port" -ForegroundColor Green

    $cfProc = Start-Process -FilePath $CLOUDFLARED `
        -ArgumentList "tunnel --url http://localhost:$port --no-autoupdate --logfile `"$tunnelLog`"" `
        -PassThru -WindowStyle Minimized

    # Wait for URL
    $tunnelUrl = $null
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $tunnelLog) {
            $logContent = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
            if ($logContent -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
                $tunnelUrl = $Matches[0]
                break
            }
        }
    }

    if ($tunnelUrl) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] TUNNEL UP: $tunnelUrl" -ForegroundColor Green
        Write-Host "  Webhook: $tunnelUrl/api/sms/webhook" -ForegroundColor Cyan

        # Update .env
        if (Test-Path $ENV_FILE) {
            $envContent = Get-Content $ENV_FILE -Raw
            if ($envContent -match "APP_BASE_URL=") {
                $envContent = $envContent -replace "APP_BASE_URL=.*", "APP_BASE_URL=$tunnelUrl"
            } else {
                $envContent = $envContent.TrimEnd() + "`nAPP_BASE_URL=$tunnelUrl`n"
            }
            Set-Content $ENV_FILE $envContent -NoNewline
        }

        # Notify backend
        try {
            Invoke-RestMethod -Uri "http://localhost:$port/api/sms/update-tunnel-url" `
                -Method POST -Body (ConvertTo-Json @{ url = $tunnelUrl }) `
                -ContentType "application/json" -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
        } catch {}
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Could not detect URL, retrying..." -ForegroundColor Red
    }

    # Monitor loop — check every 30s, including tunnel URL liveness
    $urlFailCount = 0
    while (-not $cfProc.HasExited) {
        Start-Sleep -Seconds 30
        # Test if the tunnel URL is actually reachable from the internet
        if ($tunnelUrl) {
            try {
                $resp = Invoke-WebRequest -Uri "$tunnelUrl/api/sms/webhook" `
                    -Method GET -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
                $urlFailCount = 0  # reset on success
                Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Alive: $tunnelUrl" -ForegroundColor DarkGray
            } catch {
                $statusCode = $_.Exception.Response.StatusCode.value__
                if ($statusCode -eq 405) {
                    # 405 Method Not Allowed = endpoint exists, tunnel is alive
                    $urlFailCount = 0
                    Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Alive: $tunnelUrl" -ForegroundColor DarkGray
                } else {
                    $urlFailCount++
                    Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Tunnel URL unreachable (fail #$urlFailCount): $($_.Exception.Message)" -ForegroundColor Yellow
                    if ($urlFailCount -ge 3) {
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tunnel URL dead 3 times — forcing restart..." -ForegroundColor Red
                        $cfProc | Stop-Process -Force -ErrorAction SilentlyContinue
                        break
                    }
                }
            }
        }
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tunnel died. Restarting in 3s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}
