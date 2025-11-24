#!/bin/bash

echo "🚀 启动 P2P 聊天室"
echo "===================="

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null
then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo ""

# 安装服务器依赖
echo "📦 安装服务器依赖..."
cd server
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "✅ 服务器依赖已安装"
fi
cd ..

# 安装客户端依赖
echo "📦 安装客户端依赖..."
cd client
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "✅ 客户端依赖已安装"
fi
cd ..

echo ""
echo "🎉 准备完成！"
echo ""
echo "请在两个不同的终端窗口中运行："
echo ""
echo "终端 1 - 启动服务器:"
echo "  cd server && npm start"
echo ""
echo "终端 2 - 启动客户端:"
echo "  cd client && npm run dev"
echo ""
echo "然后访问: http://localhost:3000"
echo ""

