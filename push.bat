@echo off
cd /d "%~dp0"

echo === game_KFG_bot GitHub Push ===
echo.

git add index.js deploy-commands.js push.bat .env.example

echo Commit message:
set /p MSG="> "
if "%MSG%"=="" (
    echo [ERROR] Empty message. Aborted.
    pause
    exit /b 1
)

git commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo [ERROR] Commit failed.
    pause
    exit /b 1
)

git push origin main
if %errorlevel% neq 0 (
    echo [ERROR] Push failed.
    pause
    exit /b 1
)

echo.
echo [OK] Push complete!
pause
