# KHOI DONG TOAN BO HE THONG TIMQUANNGON.COM (Docker DB + API + Web + Gateway + Cloudflare Tunnel)
$ErrorActionPreference = 'Continue'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Test-PortListening([int]$Port) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  return $null -ne $conn
}

Write-Host "=== [1/5] Kiem tra Docker & PostgreSQL (cong 55439) ===" -ForegroundColor Cyan
docker info --format "{{.ServerVersion}}" *> $null
if ($LASTEXITCODE -ne 0) {
  $dockerBackend = "C:\Users\Vimass\AppData\Local\Programs\DockerDesktop\resources\com.docker.backend.exe"
  if (Test-Path $dockerBackend) {
    Write-Host "Dang bat Docker Desktop..." -ForegroundColor Yellow
    Start-Process -FilePath $dockerBackend -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 2
      docker info --format "{{.ServerVersion}}" *> $null
      if ($LASTEXITCODE -eq 0) { break }
    }
  }
}
docker compose up -d

Write-Host "=== [2/5] Kiem tra Backend API (cong 4100) ===" -ForegroundColor Cyan
if (-not (Test-PortListening 4100)) {
  $apiCmd = "set WEB_EXTRA_ORIGINS=https://timquanngon.com,https://www.timquanngon.com&& npm.cmd run start:api"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c $apiCmd" -WorkingDirectory $projectRoot -WindowStyle Minimized
  Start-Sleep -Seconds 2
} else {
  Write-Host "API cong 4100 da chay san." -ForegroundColor Green
}

Write-Host "=== [3/5] Kiem tra Next.js Web (cong 3100) ===" -ForegroundColor Cyan
if (-not (Test-PortListening 3100)) {
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm.cmd run start:web" -WorkingDirectory $projectRoot -WindowStyle Minimized
  Start-Sleep -Seconds 2
} else {
  Write-Host "Web cong 3100 da chay san." -ForegroundColor Green
}

Write-Host "=== [4/5] Kiem tra HTTPS Gateway (cong 3181) ===" -ForegroundColor Cyan
if (-not (Test-PortListening 3181)) {
  $gwCmd = "set PHONE_PREVIEW_HOST=127.0.0.1&& set PHONE_PREVIEW_PORT=3181&& set PHONE_PREVIEW_ORIGIN=https://timquanngon.com&& set PHONE_PREVIEW_EXTRA_ORIGINS=https://www.timquanngon.com&& node scripts/phone-preview.mjs"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c $gwCmd" -WorkingDirectory $projectRoot -WindowStyle Minimized
  Start-Sleep -Seconds 1
} else {
  Write-Host "Gateway cong 3181 da chay san." -ForegroundColor Green
}

Write-Host "=== [5/5] Ket noi duong ham co dinh https://timquanngon.com ===" -ForegroundColor Cyan
$cfExe = "C:\Users\Vimass\Documents\Codex\2026-11-17\an-gi-gan-day\work\downloads\cloudflared.exe"
$cfCfg = "$HOME\.cloudflared\config.yml"
$existingCf = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if ($null -eq $existingCf) {
  Write-Host "Dang mo duong ham https://timquanngon.com (giu cua so nay hoac thu nho xuong thanh Taskbar)..." -ForegroundColor Green
  & $cfExe --config $cfCfg --no-autoupdate tunnel run timquanngon
} else {
  Write-Host "Duong ham cloudflared da chay san (PID: $($existingCf.Id -join ', '))! Truy cap ngay: https://timquanngon.com" -ForegroundColor Green
}
