#!/bin/bash


echo "=== 环境诊断 ==="
echo "当前用户: $(whoami)"
echo "当前PATH: $PATH"
echo "Node版本: $(node --version 2>&1)"
echo "npm版本: $(npm --version 2>&1)"
echo "查找pm2: $(command -v pm2 2>&1)"
echo "查找node: $(command -v node 2>&1)"

# 尝试手动加载 nvm
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
echo "加载nvm后PATH: $PATH"
echo "加载nvm后pm2: $(command -v pm2 2>&1)"

# 动态获取 pm2 路径
PM2_BIN=$(command -v pm2)

if [ -z "$PM2_BIN" ]; then
  echo "PM2 is not installed. Please install PM2 first."
  exit 1
fi

echo "PM2 path: $PM2_BIN"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}开始启动服务...${NC}"

# 确保logs目录存在
mkdir -p logs
echo -e "${GREEN}创建logs目录${NC}"

# 备份旧日志（如果需要）
if [ -d "logs" ] && [ "$(ls -A logs)" ]; then
  timestamp=$(date +"%Y%m%d_%H%M%S")
  mkdir -p logs_backup
  mv logs logs_backup/logs_$timestamp
  mkdir -p logs
  echo -e "${YELLOW}旧日志已备份到 logs_backup/logs_$timestamp${NC}"
fi

# 停止所有现有的PM2进程（如果有）
echo -e "${YELLOW}停止所有现有的PM2进程...${NC}"
$PM2_BIN delete ecosystem.config.js

sleep 1

# 使用PM2启动网关和房间节点
echo -e "${GREEN}房间节点...${NC}"
$PM2_BIN start ecosystem.config.js

# 显示所有运行的进程
echo -e "${GREEN}所有进程已启动，当前运行的进程列表:${NC}"
$PM2_BIN list

echo -e "${GREEN}所有服务已成功启动${NC}"
