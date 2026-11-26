@echo off
chcp 65001 >nul
title Khoi dong Tim Quan Ngon (https://timquanngon.com)
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\start-all-timquanngon.ps1"
pause
