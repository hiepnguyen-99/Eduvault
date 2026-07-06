$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Get-Content ".env" | ForEach-Object {
  if (-not [string]::IsNullOrWhiteSpace($_) -and -not $_.Trim().StartsWith("#")) {
    $parts = $_ -split "=", 2
    if ($parts.Length -eq 2) {
      [System.Environment]::SetEnvironmentVariable($parts[0], $parts[1])
    }
  }
}

python run_mvp.py
