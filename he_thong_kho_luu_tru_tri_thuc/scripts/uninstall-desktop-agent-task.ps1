param(
    [string]$TaskName = "EduVault Desktop Agent"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "Khong tim thay Scheduled Task: $TaskName"
    exit 0
}

try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Da go Scheduled Task: $TaskName"
