# WhatsApp Photo Downloader - Instalador/Actualizador (Windows)
# Ejecutar via install.bat o: powershell -ExecutionPolicy Bypass -File install.ps1

param(
  [string]$RepoUrl = "https://github.com/alxdx/whatsapp_automate.git",
  [string]$Branch  = "main"
)

$InstallDir   = "$env:LOCALAPPDATA\WhatsAppPhotoDownloader"
$ExtensionDir = "$InstallDir\extension"
$IsUpdate     = Test-Path "$InstallDir\.git"

if ($IsUpdate) {
  $Host.UI.RawUI.WindowTitle = "WhatsApp Photo Downloader - Actualizador"
  Write-Host ""
  Write-Host "  WhatsApp Photo Downloader - Actualizador" -ForegroundColor Green
  Write-Host "  =========================================" -ForegroundColor Green
} else {
  $Host.UI.RawUI.WindowTitle = "WhatsApp Photo Downloader - Instalador"
  Write-Host ""
  Write-Host "  WhatsApp Photo Downloader - Instalador Beta" -ForegroundColor Green
  Write-Host "  ============================================" -ForegroundColor Green
}
Write-Host ""

# -- Git ---------------------------------------------------------------------

function Install-Git {
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "  [OK] Git ya esta instalado." -ForegroundColor Green
    return
  }

  Write-Host "  [..] Instalando Git (puede tardar un minuto)..." -ForegroundColor Yellow

  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Git.Git -e --source winget `
      --accept-source-agreements --accept-package-agreements --silent
    RefreshPath
    if (Get-Command git -ErrorAction SilentlyContinue) {
      Write-Host "  [OK] Git instalado via winget." -ForegroundColor Green
      return
    }
  }

  Write-Host "  [..] Descargando instalador de Git..." -ForegroundColor Yellow
  $url  = "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe"
  $dest = "$env:TEMP\GitInstaller.exe"
  try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    Start-Process -FilePath $dest `
      -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /COMPONENTS=icons,assoc" `
      -Wait
    RefreshPath
  } catch {
    Write-Host "  [ERR] No se pudo descargar Git. Instalalo desde https://git-scm.com" -ForegroundColor Red
    exit 1
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERR] La instalacion de Git fallo. Instalalo manualmente." -ForegroundColor Red
    exit 1
  }
  Write-Host "  [OK] Git instalado." -ForegroundColor Green
}

function RefreshPath {
  $machine = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
  $user    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
  $env:PATH = "$machine;$user"
}

# -- Repo --------------------------------------------------------------------

function Install-Repo {
  Write-Host "  [..] Clonando repositorio..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  git clone --branch $Branch $RepoUrl $InstallDir
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERR] Error al clonar. Verifica la URL del repo y tu conexion a internet." -ForegroundColor Red
    exit 1
  }
  Write-Host "  [OK] Repositorio clonado." -ForegroundColor Green
}

function Update-Repo {
  Write-Host "  [..] Buscando actualizaciones..." -ForegroundColor Yellow
  Push-Location $InstallDir
  $before = git rev-parse HEAD 2>$null
  git fetch origin
  git checkout $Branch
  git pull origin $Branch
  $after = git rev-parse HEAD 2>$null
  Pop-Location
  $script:RepoChanged = ($before -ne $after)
}

# -- Chrome ------------------------------------------------------------------

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
    Write-Host "  [!] Chrome no encontrado - abre chrome://extensions/ manualmente." -ForegroundColor Yellow
  }
}

# -- Main --------------------------------------------------------------------

Install-Git

if ($IsUpdate) {
  Update-Repo
  Write-Host ""
  Write-Host "  =========================================" -ForegroundColor Green
  if ($script:RepoChanged) {
    Open-Chrome
    Write-Host "  Actualizacion descargada!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Para aplicar la actualizacion:" -ForegroundColor Yellow
    Write-Host "    1. En Chrome, ve a chrome://extensions/"
    Write-Host "    2. Haz clic en el icono de recargar en 'WhatsApp Photo Downloader'"
    Write-Host "    3. Recarga la pagina de WhatsApp Web"
  } else {
    Write-Host "  Ya tienes la ultima version - sin cambios." -ForegroundColor Green
  }
} else {
  Install-Repo
  Open-Chrome
  Write-Host ""
  Write-Host "  ============================================" -ForegroundColor Green
  Write-Host "  Instalacion completa!" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Carpeta de la extension: $ExtensionDir" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Pasos siguientes:" -ForegroundColor Yellow
  Write-Host "    1. En Chrome, escribe en la barra de direcciones: chrome://extensions/"
  Write-Host "    2. Activa el 'Modo desarrollador' (interruptor, arriba a la derecha)"
  Write-Host "    3. Haz clic en 'Cargar sin empaquetar'"
  Write-Host "    4. Selecciona esta carpeta: $ExtensionDir"
  Write-Host "    5. Abre https://web.whatsapp.com - el boton de camara aparecera"
}

Write-Host ""
Read-Host "  Presiona Enter para salir"
