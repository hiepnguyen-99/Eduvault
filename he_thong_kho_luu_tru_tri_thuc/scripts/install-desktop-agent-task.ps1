param(
    [string]$TaskName = "EduVault Desktop Agent",
    [string]$ConfigPath,
    [switch]$StartNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktopAgentRoot = Join-Path $repoRoot "desktop-agent"
$runScript = Join-Path $repoRoot "desktop-agent\run-agent.ps1"
$hiddenLauncher = Join-Path $repoRoot "scripts\run-hidden.vbs"
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $repoRoot "desktop-agent\config.json"
}
$configPath = [System.IO.Path]::GetFullPath($ConfigPath)

if (-not (Test-Path -LiteralPath $runScript)) {
    throw "Khong tim thay file run script: $runScript"
}

if (-not (Test-Path -LiteralPath $hiddenLauncher)) {
    throw "Khong tim thay hidden launcher: $hiddenLauncher"
}

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Khong tim thay config Desktop Agent: $configPath"
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$config.token)) {
    throw "Desktop Agent chua co token. Hay dang nhap bang 'python agent.py --config config.json' trong thu muc desktop-agent truoc."
}

function Resolve-PythonwCommand {
    $candidates = @(
        (Join-Path $repoRoot ".venv\Scripts\pythonw.exe"),
        (Join-Path $desktopAgentRoot ".venv\Scripts\pythonw.exe"),
        "C:\Users\Admin\AppData\Local\Programs\Python\Python312\pythonw.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    $pythonw = Get-Command pythonw.exe -ErrorAction SilentlyContinue
    if ($pythonw -and $pythonw.Source) {
        return $pythonw.Source
    }

    throw "Khong tim thay pythonw.exe de chay Desktop Agent an khong hien console."
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$pythonwExe = Resolve-PythonwCommand
$actionArgs = "`"gui.py`" --config `"$configPath`" --startup"

$action = New-ScheduledTaskAction -Execute $pythonwExe -Argument $actionArgs -WorkingDirectory $desktopAgentRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Khoi dong EduVault Desktop Agent an de tu dong dong bo file moi vao he thong."

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

if ($StartNow) {
    Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Da dang ky Scheduled Task: $TaskName"
Write-Host "User: $currentUser"
Write-Host "Run script: $runScript"
Write-Host "Config: $configPath"
if ($StartNow) {
    Write-Host "Task da duoc yeu cau khoi dong ngay."
} else {
    Write-Host "Task se tu dong chay o lan dang nhap Windows tiep theo."
}
