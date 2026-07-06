$ErrorActionPreference = "Stop"

function Resolve-CloudflaredExe {
    $searchPaths = @()

    $pathCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($pathCommand -and $pathCommand.Source) {
        $searchPaths += $pathCommand.Source
        return @{
            Path = $pathCommand.Source
            Searched = $searchPaths
        }
    }

    $candidates = @(
        "C:\Program Files\cloudflared\cloudflared.exe",
        "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    )

    foreach ($candidate in $candidates) {
        $searchPaths += $candidate
        if (Test-Path $candidate) {
            return @{
                Path = $candidate
                Searched = $searchPaths
            }
        }
    }

    $searchedText = ($searchPaths | ForEach-Object { "- $_" }) -join [Environment]::NewLine
    throw "cloudflared.exe was not found. Searched paths:$([Environment]::NewLine)$searchedText"
}

$CloudflaredResolution = Resolve-CloudflaredExe
$CloudflaredExe = $CloudflaredResolution.Path

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)))
$TunnelDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = if ($args.Count -gt 0) { $args[0] } else { Join-Path $RepoRoot ".env.demo" }
$TemplateFile = Join-Path $TunnelDir "config.demo.template.yml"
$OutputFile = Join-Path $TunnelDir "config.demo.generated.yml"

if (-not (Test-Path $EnvFile)) {
    throw "Missing env file: $EnvFile"
}

$envMap = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
        return
    }
    $parts = $line.Split("=", 2)
    $envMap[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
}

foreach ($required in @(
    "CLOUDFLARE_TUNNEL_ID",
    "CLOUDFLARE_CREDENTIALS_FILE",
    "CLOUDFLARE_FRONTEND_HOSTNAME",
    "CLOUDFLARE_BACKEND_HOSTNAME",
    "CLOUDFLARE_FRONTEND_HOSTNAME_ALT",
    "CLOUDFLARE_BACKEND_HOSTNAME_ALT"
)) {
    if (-not $envMap.ContainsKey($required) -or [string]::IsNullOrWhiteSpace($envMap[$required])) {
        throw "Missing $required in $EnvFile"
    }
}

$frontendPort = if ($envMap.ContainsKey("FRONTEND_PORT")) { $envMap["FRONTEND_PORT"] } else { "3000" }
$backendPort = if ($envMap.ContainsKey("BACKEND_PORT")) { $envMap["BACKEND_PORT"] } else { "8080" }

$content = Get-Content $TemplateFile -Raw
$content = $content.Replace("__CLOUDFLARE_TUNNEL_ID__", $envMap["CLOUDFLARE_TUNNEL_ID"])
$content = $content.Replace("__CLOUDFLARE_CREDENTIALS_FILE__", $envMap["CLOUDFLARE_CREDENTIALS_FILE"])
$content = $content.Replace("__CLOUDFLARE_FRONTEND_HOSTNAME_ALT__", $envMap["CLOUDFLARE_FRONTEND_HOSTNAME_ALT"])
$content = $content.Replace("__CLOUDFLARE_BACKEND_HOSTNAME_ALT__", $envMap["CLOUDFLARE_BACKEND_HOSTNAME_ALT"])
$content = $content.Replace("__CLOUDFLARE_FRONTEND_HOSTNAME__", $envMap["CLOUDFLARE_FRONTEND_HOSTNAME"])
$content = $content.Replace("__CLOUDFLARE_BACKEND_HOSTNAME__", $envMap["CLOUDFLARE_BACKEND_HOSTNAME"])
$content = $content.Replace("__FRONTEND_PORT__", $frontendPort)
$content = $content.Replace("__BACKEND_PORT__", $backendPort)

Set-Content -Path $OutputFile -Value $content -NoNewline
Write-Host "Generated: $OutputFile"
