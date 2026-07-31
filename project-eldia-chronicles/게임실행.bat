@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   엘디아 연대기: 여명의 맹세 — 로컬 서버
echo   (격자 전술 전투 버전 — project-eldia-chronicles)
echo   이 창을 닫으면 게임 서버가 종료됩니다.
echo ============================================
start "" "http://localhost:3005"
python -m http.server 3005 --bind 127.0.0.1
