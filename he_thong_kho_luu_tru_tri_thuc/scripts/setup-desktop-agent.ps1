param(
    [string]$BackendUrl = "",
    [string]$WatchFolder = "D:\Teaching",
    [string]$UserCode = "",
    [string]$ConfigPath,
    [switch]$CreateTask,
    [switch]$StartTaskNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BackendUrl)) {
    if (-not [string]::IsNullOrWhiteSpace($env:DESKTOP_AGENT_BACKEND_URL)) {
        $BackendUrl = $env:DESKTOP_AGENT_BACKEND_URL
    } elseif (-not [string]::IsNullOrWhiteSpace($env:BACKEND_URL)) {
        $BackendUrl = $env:BACKEND_URL
    } else {
        $BackendUrl = "https://api.example.edu"
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$agentRoot = Join-Path $repoRoot "desktop-agent"
$requirementsPath = Join-Path $agentRoot "requirements.txt"
$templatePath = Join-Path $agentRoot "config.example.json"
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $agentRoot "config.json"
}
$ConfigPath = [System.IO.Path]::GetFullPath($ConfigPath)

function Resolve-PythonCommand {
    $candidates = @(
        (Join-Path $repoRoot ".venv\Scripts\python.exe"),
        (Join-Path $agentRoot ".venv\Scripts\python.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return @($candidate)
        }
    }

    $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        return @($pyLauncher.Source, "-3")
    }

    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($python) {
        return @($python.Source)
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return @($python.Source)
    }

    throw "Khong tim thay Python 3 tren may nay."
}

if (-not (Test-Path -LiteralPath $requirementsPath)) {
    throw "Khong tim thay requirements cua Desktop Agent: $requirementsPath"
}

if (-not (Test-Path -LiteralPath $templatePath)) {
    throw "Khong tim thay config.example.json: $templatePath"
}

$watchFolderNormalized = $WatchFolder.Trim().Replace("/", "\")
if ([string]::IsNullOrWhiteSpace($watchFolderNormalized)) {
    throw "WatchFolder khong duoc de trong."
}

if (-not (Test-Path -LiteralPath $watchFolderNormalized)) {
    New-Item -ItemType Directory -Force -Path $watchFolderNormalized | Out-Null
}

$pythonCommand = Resolve-PythonCommand
$pythonExe = $pythonCommand[0]
$pythonArgs = @()
if ($pythonCommand.Length -gt 1) {
    $pythonArgs = $pythonCommand[1..($pythonCommand.Length - 1)]
}

$venvPath = Join-Path $agentRoot ".venv"
if (-not (Test-Path -LiteralPath (Join-Path $venvPath "Scripts\python.exe"))) {
    & $pythonExe @pythonArgs -m venv $venvPath
}

$venvPython = Join-Path $venvPath "Scripts\python.exe"
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r $requirementsPath

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Copy-Item -LiteralPath $templatePath -Destination $ConfigPath
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$normalizedBackendUrl = $BackendUrl.Trim().TrimEnd("/")
$isLocalBackend = $normalizedBackendUrl -match '^https?://(127\.0\.0\.1|localhost)(:\d+)?($|/)'
$config.watch_folder = $watchFolderNormalized
$config.watch_folders = @($watchFolderNormalized)
$config.backend_url = $normalizedBackendUrl
$config.active_backend = if ($isLocalBackend) { "local" } else { "deploy" }
if (-not $config.PSObject.Properties.Name.Contains("backend_profiles") -or $null -eq $config.backend_profiles) {
    $config | Add-Member -NotePropertyName backend_profiles -NotePropertyValue ([pscustomobject]@{}) -Force
}
$config.backend_profiles.local = "http://127.0.0.1:8080"
$config.backend_profiles.deploy = $normalizedBackendUrl
$config.remote_watch_config_loaded = $false
if (-not [string]::IsNullOrWhiteSpace($UserCode)) {
    $config.user_code = $UserCode.Trim().ToUpperInvariant()
}
$config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

Write-Host "Desktop Agent da duoc chuan bi."
Write-Host "Python: $venvPython"
Write-Host "Config: $ConfigPath"
Write-Host "Active backend: $($config.active_backend)"
Write-Host "Backend URL: $($config.backend_url)"
Write-Host "Watch folder: $watchFolderNormalized"

if ($CreateTask) {
    $installTaskScript = Join-Path $repoRoot "scripts\install-desktop-agent-task.ps1"
    $taskArgs = @{
        ConfigPath = $ConfigPath
    }
    if ($StartTaskNow) {
        $taskArgs["StartNow"] = $true
    }
    & $installTaskScript @taskArgs
}

Write-Host ""
Write-Host "Buoc tiep theo:"
Write-Host "1. Dang nhap 1 lan: powershell -ExecutionPolicy Bypass -File .\desktop-agent\run-agent.ps1 -ConfigPath `"$ConfigPath`""
Write-Host "2. Sau khi dang nhap thanh cong, dang ky tu chay cung Windows:"
Write-Host "   powershell -ExecutionPolicy Bypass -File .\scripts\install-desktop-agent-task.ps1 -ConfigPath `"$ConfigPath`" -StartNow"
