param(
    [string]$TaskName = "EduVault Desktop Agent",
    [string]$ConfigPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$agentRoot = Join-Path $repoRoot "desktop-agent"
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $agentRoot "config.json"
}
$logPath = Join-Path $agentRoot "logs\desktop-agent.log"

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Khong tim thay config Desktop Agent: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$taskInfo = if ($task) { Get-ScheduledTaskInfo -TaskName $TaskName } else { $null }
$resolvedBackend = $config.backend_url
if ($null -ne $config.backend_profiles -and -not [string]::IsNullOrWhiteSpace([string]$config.active_backend)) {
    $activeBackendName = [string]$config.active_backend
    $activeProfileUrl = [string]$config.backend_profiles.$activeBackendName
    if (-not [string]::IsNullOrWhiteSpace($activeProfileUrl)) {
        $resolvedBackend = $activeProfileUrl.TrimEnd("/")
    }
}
$port = 8765
try {
    $port = [int]($config.local_control_port)
} catch {
    $port = 8765
}

$socket = Test-NetConnection -ComputerName "127.0.0.1" -Port $port -WarningAction SilentlyContinue

Write-Host "EduVault Desktop Agent Check"
Write-Host "============================"
Write-Host "Config       $ConfigPath"
Write-Host "Active mode  $($config.active_backend)"
Write-Host "Backend URL  $resolvedBackend"
Write-Host "Watch folder $($config.watch_folder)"
Write-Host "User code    $($config.user_code)"
Write-Host "Token saved  $([bool](-not [string]::IsNullOrWhiteSpace([string]$config.token)))"
if ($task) {
    Write-Host "Task         $($task.State)"
    Write-Host "Last run     $($taskInfo.LastRunTime)"
    Write-Host "Last result  $($taskInfo.LastTaskResult)"
} else {
    Write-Host "Task         Not installed"
}
Write-Host "Control API  $($socket.TcpTestSucceeded) on 127.0.0.1:$port"
if ($config.active_backend -eq "local" -and $resolvedBackend -notmatch '^https?://(127\.0\.0\.1|localhost)(:\d+)?($|/)') {
    Write-Host "Warning      active_backend dang la local nhung backend hien tai khong phai localhost."
}
if ([string]::IsNullOrWhiteSpace([string]$config.user_code)) {
    Write-Host "Warning      Chua co user_code. Agent can dang nhap lai it nhat 1 lan."
}
if ([string]::IsNullOrWhiteSpace([string]$config.token)) {
    Write-Host "Warning      Chua co token dang nhap luu trong config."
}
if (Test-Path -LiteralPath $logPath) {
    Write-Host ""
    Write-Host "Recent log"
    Write-Host "----------"
    Get-Content -LiteralPath $logPath -Tail 15
}
