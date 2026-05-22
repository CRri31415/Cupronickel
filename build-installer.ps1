# ============================================================
#  build-installer.ps1
#  Cupronickel 설치 프로그램을 자동으로 만들어 주는 스크립트.
#
#  하는 일(컴퓨터를 잘 몰라도 됩니다):
#   1) 관리자 권한으로 다시 실행
#   2) 빌드에 꼭 필요한 최소한의 프로그램만 자동 설치
#      - Node.js (화면 부분 빌드)
#      - Rust (프로그램 본체 빌드)
#      - Visual Studio Build Tools (C++ 컴파일러)
#      - WebView2 런타임 (실행에 필요, 보통 Win11엔 이미 있음)
#   3) Cupronickel 설치 파일(.exe) 생성
#   4) 만들어진 설치 파일 폴더를 자동으로 열어 줌
#
#  Windows 10(1809+) / Windows 11 에서 동작합니다. winget(앱 설치 관리자)을 사용합니다.
# ============================================================

$ErrorActionPreference = "Stop"

# 콘솔 출력 인코딩을 UTF-8로 맞춘다(한글 깨짐 방지).
# 이 .ps1 파일은 UTF-8 BOM으로 저장되어 있어 Windows PowerShell 5.1도 한글을 바르게 읽는다.
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  chcp 65001 > $null
} catch {}

# --- 1) 관리자 권한 확인 및 자동 승격 ---
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "관리자 권한으로 다시 실행합니다..." -ForegroundColor Yellow
  Start-Process powershell -Verb RunAs -ArgumentList `
    "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

# 스크립트가 있는 폴더(=프로젝트 루트)로 이동
Set-Location -Path $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# 설치 직후에도 PATH가 현재 창에 반영되도록 새로고침한다.
function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user    = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# winget 한 줄 설치 헬퍼(이미 설치돼 있으면 그냥 넘어감).
function Ensure-Winget($id, $extra = @()) {
  $wgArgs = @("install", "--id", $id, "-e",
              "--accept-package-agreements", "--accept-source-agreements") + $extra
  Write-Host "  - $id 확인/설치..."
  & winget @wgArgs 2>$null | Out-Null
}

# --- 2) winget 사용 가능 여부 ---
if (-not (Have "winget")) {
  Write-Host "이 컴퓨터에는 'winget'(앱 설치 관리자)이 없습니다." -ForegroundColor Red
  Write-Host "Microsoft Store에서 '앱 설치 관리자(App Installer)'를 설치한 뒤 다시 실행해 주세요."
  Write-Host "또는 Windows를 최신 상태로 업데이트하면 함께 설치됩니다."
  return
}

# --- 3) 필요한 프로그램 자동 설치(최소 구성) ---
Write-Step "필요한 프로그램을 확인하고 설치합니다 (처음엔 몇 분 걸릴 수 있어요)"

if (-not (Have "node")) { Ensure-Winget "OpenJS.NodeJS.LTS" }
if (-not (Have "rustc")) { Ensure-Winget "Rustlang.Rustup" }

# C++ 빌드 도구(Visual Studio Build Tools) — Tauri의 Windows 빌드에 필요.
# VCTools 워크로드만 조용히 설치한다.
$vcInstalled = Test-Path "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
if (-not $vcInstalled) {
  Ensure-Winget "Microsoft.VisualStudio.2022.BuildTools" @(
    "--override",
    "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  )
}

# WebView2 런타임(실행 시 필요, 보통 이미 설치돼 있음).
Ensure-Winget "Microsoft.EdgeWebView2Runtime"

Refresh-Path

# rustup이 막 깔렸다면 stable 툴체인을 보장한다.
if (Have "rustup") { & rustup default stable 2>$null | Out-Null }
Refresh-Path

# 설치가 현재 창에 반영 안 됐을 때 안내
if (-not (Have "node") -or -not (Have "cargo")) {
  Write-Host "`n일부 프로그램이 방금 설치되어 아직 인식되지 않습니다." -ForegroundColor Yellow
  Write-Host "이 창을 닫고 BUILD-INSTALLER.bat 를 한 번 더 더블클릭해 주세요."
  return
}

# --- 4) 프로젝트 의존성 설치 + 설치 프로그램 빌드 ---
Write-Step "화면 구성요소를 준비합니다 (npm install)"
& npm install

Write-Step "Cupronickel 설치 프로그램을 만듭니다 (npm run tauri build)"
& npm run tauri build

# --- 5) 결과 폴더 열기 ---
$nsis = Join-Path $PSScriptRoot "src-tauri\target\release\bundle\nsis"
Write-Step "완료!"
if (Test-Path $nsis) {
  Write-Host "설치 파일이 아래 폴더에 만들어졌습니다:" -ForegroundColor Green
  Write-Host "  $nsis"
  Start-Process explorer.exe $nsis
} else {
  Write-Host "빌드는 끝났지만 설치 파일 폴더를 찾지 못했습니다. 위 로그를 확인해 주세요." -ForegroundColor Yellow
}
