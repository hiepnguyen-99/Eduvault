# Tu dong hoa toan bo quy trinh Deploy len Vercel voi link Serveo ngau nhien (Khong can dang ky SSH Key)
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  DON DEP HE THONG & DEPLOY VERCEL VOI LINK NGAU NHIEN    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Don dep cac tien trinh cu chay nen (Python, Node, SSH) va xoa log cu
Write-Host ""
Write-Host "[1/5] Dang tat cac tien trinh cu va xoa log..." -ForegroundColor Yellow
try {
    taskkill /F /IM python.exe 2>$null
    taskkill /F /IM python3.exe 2>$null
    taskkill /F /IM node.exe 2>$null
    taskkill /F /IM ssh.exe 2>$null
} catch {}

if (Test-Path "serveo.log") { Remove-Item "serveo.log" -Force }
if (Test-Path "serveo.err.log") { Remove-Item "serveo.err.log" -Force }

# 2. Khoi dong cac database/dich vu Docker qua WSL
Write-Host ""
Write-Host "[2/5] Khoi dong cac dich vu Docker qua WSL..." -ForegroundColor Yellow
wsl docker compose -f docker-compose.v2.yml up -d

# 3. Khoi dong Backend local
Write-Host ""
Write-Host "[3/5] Chay script khoi dong Backend..." -ForegroundColor Yellow
if (Test-Path "run_v2_demo.ps1") {
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Stop"
    powershell -ExecutionPolicy Bypass -File .\run_v2_demo.ps1
    $ErrorActionPreference = $oldEap
} else {
    Write-Warning "Khong tim thay file run_v2_demo.ps1, dang bo qua..."
}

# 4. Khoi dong Serveo voi LINK NGAU NHIEN va tu dong doc link
Write-Host ""
Write-Host "[4/5] Dang khoi tao duong ham Serveo ngau nhien..." -ForegroundColor Yellow
Start-Process ssh -ArgumentList "-o","StrictHostKeyChecking=no","-R","80:127.0.0.1:8081","serveo.net" `
    -RedirectStandardOutput "serveo.log" -RedirectStandardError "serveo.err.log" -NoNewWindow

# Cho va doc URL tu file log cua Serveo
Write-Host "Dang lay link tunnel tu Serveo..." -ForegroundColor Gray
$ApiUrl = $null
for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path "serveo.log") {
        $logContent = Get-Content "serveo.log" -Raw
        # Tim kiem chuoi bat dau bang https:// va chua serveo.net hoac serveousercontent.com
        if ($logContent -match "https://[a-zA-Z0-9.-]+") {
            $ApiUrl = $Matches[0].Trim()
            break
        }
    }
}

if (-not $ApiUrl) {
    Write-Error "Khong the lay duoc link tu Serveo. Vui long kiem tra file serveo.err.log"
    exit
}

Write-Host "Da lay thanh cong Link API: $ApiUrl" -ForegroundColor Green

# 5. Xoa Cache Frontend & Trien khai len Vercel voi link vua lay duoc
Write-Host ""
Write-Host "[5/5] Xoa cache local & Deploy Frontend len Vercel..." -ForegroundColor Yellow
$FrontendDir = Join-Path $ScriptDir "frontend"
Set-Location $FrontendDir

# Xoa thu muc .next (Next.js Cache local)
if (Test-Path ".next") {
    Write-Host "Dang xoa thu muc cache .next..." -ForegroundColor Gray
    Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
}

Write-Host "Dang cai dat node_modules (npm install)..." -ForegroundColor Gray
npm install

Write-Host "Dang thiet lap bien moi truong API URL tren Vercel..." -ForegroundColor Gray
npx vercel env add NEXT_PUBLIC_API_URL production --value $ApiUrl --yes --force

# Deploy voi tham so --force de buoc Vercel bo qua cache build tu phia Server (Clear remote build cache)
Write-Host "Dang deploy len Vercel (bat buoc build moi khong cache)..." -ForegroundColor Green
npx vercel --prod --force

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  DEPLOY HOAN TAT VOI LINK NGAU NHIEN SANG TAO TU DONG!" -ForegroundColor Green
Write-Host "  Link API hien tai: $ApiUrl" -ForegroundColor Green
Write-Host "  Vui long giu CMD nay hoac khong tat tien trinh ssh.exe." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
