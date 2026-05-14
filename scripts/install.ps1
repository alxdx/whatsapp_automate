# WhatsApp Photo Downloader — Beta Installer (Windows)
# Run via install.bat or: powershell -ExecutionPolicy Bypass -File install.ps1

param(
  [string]$RepoUrl = "https://github.com/alxdx/whatsapp_automate.git",
  [string]$Branch  = "main"
)

$InstallDir   = "$env:LOCALAPPDATA\WhatsAppPhotoDownloader"
$ExtensionDir = "$InstallDir\extension"

$Host.UI.RawUI.WindowTitle = "WhatsApp Photo Downloader — Installer"
Write-Host ""
Write-Host "  WhatsApp Photo Downloader — Beta Installer" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""

# ── 1. Install Git if missing ──────────────────────────────────────────────

function Install-Git {
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "  [OK] Git already installed." -ForegroundColor Green
    return
  }

  Write-Host "  [..] Installing Git (this may take a minute)..." -ForegroundColor Yellow

  # Try winget first (available on Windows 10 1709+)
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Git.Git -e --source winget `
      --accept-source-agreements --accept-package-agreements --silent
    RefreshPath
    if (Get-Command git -ErrorAction SilentlyContinue) {
      Write-Host "  [OK] Git installed via winget." -ForegroundColor Green
      return
    }
  }

  # Fallback: download Git installer directly
  Write-Host "  [..] Downloading Git installer..." -ForegroundColor Yellow
  $url  = "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe"
  $dest = "$env:TEMP\GitInstaller.exe"
  try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    Start-Process -FilePath $dest `
      -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /COMPONENTS=icons,assoc" `
      -Wait
    RefreshPath
  } catch {
    Write-Host "  [ERR] Could not download Git. Please install from https://git-scm.com" -ForegroundColor Red
    exit 1
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERR] Git installation failed. Please install manually." -ForegroundColor Red
    exit 1
  }
  Write-Host "  [OK] Git installed." -ForegroundColor Green
}

function RefreshPath {
  $machine = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
  $user    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
  $env:PATH = "$machine;$user"
}

# ── 2. Clone or update the repository ─────────────────────────────────────

function Setup-Repo {
  if (Test-Path "$InstallDir\.git") {
    Write-Host "  [..] Updating existing installation..." -ForegroundColor Yellow
    Push-Location $InstallDir
    git fetch origin
    git checkout $Branch
    git pull origin $Branch
    Pop-Location
    Write-Host "  [OK] Repository updated." -ForegroundColor Green
  } else {
    Write-Host "  [..] Cloning repository..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    git clone --branch $Branch $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  [ERR] Clone failed. Check the repo URL and your internet connection." -ForegroundColor Red
      exit 1
    }
    Write-Host "  [OK] Repository cloned." -ForegroundColor Green
  }
}

# ── 3. Open Chrome at the extensions page ─────────────────────────────────

function Open-Chrome {
  $paths = @(
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )
  $chrome = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($chrome) {
    Start-Process $chrome "chrome://extensions/"
  } else {
    Write-Host "  [!] Chrome not found — open chrome://extensions/ manually." -ForegroundColor Yellow
  }
}

# ── Main ───────────────────────────────────────────────────────────────────

Install-Git
Setup-Repo
Open-Chrome

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Extension folder: $ExtensionDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. In Chrome, enable Developer mode (toggle, top-right)"
Write-Host "    2. Click 'Load unpacked'"
Write-Host "    3. Select this folder: $ExtensionDir"
Write-Host "    4. Open https://web.whatsapp.com — the camera button will appear"
Write-Host ""
Read-Host "  Press Enter to exit"
