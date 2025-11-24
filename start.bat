@echo off
chcp 65001 >nul
echo 🚀 启动 P2P 聊天室
echo ====================

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 错误: 未找到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js 已安装
echo.

REM 安装服务器依赖
echo 📦 安装服务器依赖...
cd server
if not exist "node_modules" (
    call npm install
) else (
    echo ✅ 服务器依赖已安装
)
cd ..

REM 安装客户端依赖
echo 📦 安装客户端依赖...
cd client
if not exist "node_modules" (
    call npm install
) else (
    echo ✅ 客户端依赖已安装
)
cd ..

echo.
echo 🎉 准备完成！
echo.
echo 请在两个不同的命令提示符窗口中运行：
echo.
echo 窗口 1 - 启动服务器:
echo   cd server ^&^& npm start
echo.
echo 窗口 2 - 启动客户端:
echo   cd client ^&^& npm run dev
echo.
echo 然后访问: http://localhost:3000
echo.
pause

