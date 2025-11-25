#!/bin/bash

# 启动后端 HTTPS 服务器

echo "🔐 启动后端 HTTPS 服务器..."
echo ""

# 检查证书是否存在
if [ ! -f "../certs/cert.pem" ] || [ ! -f "../certs/key.pem" ]; then
  echo "❌ 错误：未找到 SSL 证书！"
  echo ""
  echo "请先生成证书："
  echo "  mkdir -p certs && cd certs"
  echo "  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout key.pem -out cert.pem -days 365"
  echo ""
  exit 1
fi

# 清理端口
echo "🧹 清理端口 3001 和 9000..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:9000 | xargs kill -9 2>/dev/null
sleep 1

echo ""
echo "🚀 启动后端服务器..."
echo ""

# 进入 server 目录并启动
cd server
node server-https.js

