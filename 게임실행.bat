@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   엘디아 연대기 - 개발 서버 (BETA)
echo   캐시를 끄고 서비스합니다.
echo   코드를 고치면 F5만 눌러도 바로 반영됩니다.
echo   이 창을 닫으면 서버가 종료됩니다.
echo ============================================
start "" "http://localhost:3010"
python tools\serve.py 3010