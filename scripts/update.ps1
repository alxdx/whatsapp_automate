# WhatsApp Photo Downloader — Updater (Windows)
# Run via update.bat or: powershell -ExecutionPolicy Bypass -File update.ps1

$InstallDir = "$env:LOCALAPPDATA\WhatsAppPhotoDownloader"

$Host.UI.RawUI.WindowTitle = "WhatsApp Photo Downloader — Updater"
Write-Host ""
Write-Host "  WhatsApp Photo Downloader — Updater" -ForegroundColor Green
Write-Host "  =====================================" -ForegroundColor Green
Write-Host ""

if (-not (Test-Path "$InstallDir\.git")) {
  Write-Host "  [ERR] Extension not installed. Please run install.bat first." -ForegroundColor Red
  Read-Host "  Press Enter to exit"
  exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "  [ERR] Git not found. Please run install.bat to repair." -ForegroundColor Red
  Read-Host "  Press Enter to exit"
  exit 1
}

Write-Host "  [..] Checking for updates..." -ForegroundColor Yellow

Push-Location $InstallDir
$before = git rev-parse HEAD 2>$null
git fetch origin
git pull origin main
$after  = git rev-parse HEAD 2>$null
Pop-Location

if ($before -eq $after) {
  Write-Host "  [OK] Already up to date — no changes." -ForegroundColor Green
} else {
  Write-Host "  [OK] Update downloaded!" -ForegroundColor Green
  Write-Host ""
  Write-Host "  To apply the update:" -ForegroundColor Yellow
  Write-Host "    1. Go to chrome://extensions/"
  Write-Host "    2. Click the refresh (↺) icon on 'WhatsApp Photo Downloader'"
  Write-Host "    3. Reload the WhatsApp Web tab"
  Write-Host ""

  $paths  = @(
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )
  $chrome = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($chrome) { Start-Process $chrome "chrome://extensions/" }
}

Write-Host ""
Read-Host "  Press Enter to exit"
