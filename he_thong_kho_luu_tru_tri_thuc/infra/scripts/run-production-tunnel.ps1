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

$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptsDir)
$TunnelDir = Join-Path $RepoRoot "infra\tunnel\cloudflared"
$EnvFile = if ($args.Count -gt 0) { $args[0] } else { Join-Path $RepoRoot ".env" }

& (Join-Path $TunnelDir "render-production-config.ps1") $EnvFile
& $CloudflaredExe --version
& $CloudflaredExe tunnel --config (Join-Path $TunnelDir "config.production.generated.yml") run
