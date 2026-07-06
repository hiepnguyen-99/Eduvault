param(
    [string]$PyInstallerExe = "pyinstaller",
    [string]$InnoSetupCompiler = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$agentRoot = Join-Path $repoRoot "desktop-agent"
$installerRoot = Join-Path $repoRoot "installer"
$specPath = Join-Path $agentRoot "EduVaultDesktopAgent.spec"
$issPath = Join-Path $installerRoot "EduVaultDesktopAgent.iss"
$portableDistRoot = Join-Path $repoRoot "dist"
$installerDistRoot = Join-Path $agentRoot "dist"
$portableExe = Join-Path $portableDistRoot "EduVaultDesktopAgent.exe"
$publishedExe = Join-Path $installerDistRoot "EduVaultDesktopAgent.exe"
$setupExe = Join-Path $installerDistRoot "EduVaultDesktopAgentSetup.exe"
$portableReleaseExe = Join-Path $installerDistRoot "EduVaultDesktopAgentPortable.exe"
$pythonRoot = (& python -c "import sys; print(sys.base_prefix)").Trim()
$tclLibrary = Join-Path $pythonRoot "tcl\tcl8.6"
$tkLibrary = Join-Path $pythonRoot "tcl\tk8.6"

if (-not (Test-Path -LiteralPath $specPath)) {
    throw "Khong tim thay file spec: $specPath"
}
if (-not (Test-Path -LiteralPath $issPath)) {
    throw "Khong tim thay file Inno Setup: $issPath"
}

if (-not (Test-Path -LiteralPath $InnoSetupCompiler)) {
    throw "Khong tim thay Inno Setup compiler tai $InnoSetupCompiler. Cai Inno Setup 6 de build installer chuan. Neu can phat hanh tam thoi, dung file portable desktop-agent\\dist\\EduVaultDesktopAgentPortable.exe sau khi build xong."
}

Push-Location $repoRoot
try {
    if (Test-Path -LiteralPath $tclLibrary) {
        $env:TCL_LIBRARY = $tclLibrary
    }
    if (Test-Path -LiteralPath $tkLibrary) {
        $env:TK_LIBRARY = $tkLibrary
    }
    & $PyInstallerExe --clean $specPath
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $portableExe)) {
    throw "Khong tim thay file portable EXE sau khi build: $portableExe"
}

New-Item -ItemType Directory -Force -Path $installerDistRoot | Out-Null
Copy-Item -LiteralPath $portableExe -Destination $publishedExe -Force
Copy-Item -LiteralPath $portableExe -Destination $portableReleaseExe -Force

& $InnoSetupCompiler $issPath
Write-Host "Da build xong installer chuan: desktop-agent\\dist\\EduVaultDesktopAgentSetup.exe"
Write-Host "Da tao them ban portable: desktop-agent\\dist\\EduVaultDesktopAgentPortable.exe"
