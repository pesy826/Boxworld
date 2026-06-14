@echo off
chcp 65001 >nul
title 盒世界 BoxWorld - 开发模式
cd /d "%~dp0"

echo ============================================
echo   盒世界 BoxWorld - 开发模式（浏览器）
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖（npm install）...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
)

echo [提示] 正在启动开发服务器，稍后将自动打开浏览器...
echo [提示] 关闭此窗口即可停止服务。
echo.

start "" http://localhost:5173
call npm run dev

pause