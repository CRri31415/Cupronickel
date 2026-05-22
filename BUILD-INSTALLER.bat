@echo off
REM ============================================================
REM  Cupronickel installer builder (one-click)
REM  Just double-click this file. It will install the required
REM  tools and build the Cupronickel installer automatically.
REM  (Korean messages are printed by the PowerShell script.)
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1"
echo.
echo Press any key to close this window.
pause >nul
