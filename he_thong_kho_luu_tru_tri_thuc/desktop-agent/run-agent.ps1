param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config.json"),
    [switch]$Startup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$desktopAgentRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopAgentRoot
$configTemplatePath = Join-Path $desktopAgentRoot "config.example.json"

function Resolve-PythonCommand {
    $candidates = @(
        (Join-Path $repoRoot ".venv\Scripts\python.exe"),
        (Join-Path $desktopAgentRoot ".venv\Scripts\python.exe"),
        "C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return @{
                Executable = $candidate
                Arguments = @()
            }
        }
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return @{
            Executable = $python.Source
            Arguments = @()
        }
    }

    $pythonExe = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pythonExe) {
        return @{
            Executable = $pythonExe.Source
            Arguments = @()
        }
    }

    $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        return @{
            Executable = $pyLauncher.Source
            Arguments = @("-3")
        }
    }

    throw "Khong tim thay python.exe hoac py.exe de chay Desktop Agent."
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    if (Test-Path -LiteralPath $configTemplatePath) {
        Copy-Item -LiteralPath $configTemplatePath -Destination $ConfigPath
        Write-Host "Da tao config moi tu mau: $ConfigPath"
    } else {
        throw "Khong tim thay config Desktop Agent tai: $ConfigPath"
    }
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$config.token)) {
    throw "Desktop Agent chua co token. Hay chay 'python agent.py --config config.json' va dang nhap 1 lan truoc khi dung Task Scheduler."
}

$logDir = Join-Path $desktopAgentRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$pythonCommand = Resolve-PythonCommand
$arguments = @()
$arguments += $pythonCommand.Arguments
$arguments += @("gui.py", "--config", $ConfigPath)
if ($Startup) {
    $arguments += "--startup"
}

Set-Location -LiteralPath $desktopAgentRoot
& $pythonCommand.Executable @arguments
