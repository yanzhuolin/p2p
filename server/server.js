const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PeerServer } = require('peer');
const express = require('express');
const cors = require('cors');

/**
 * 创建并配置 Express 应用
 */
function createApp() {
  const app = express();

  // 启用CORS
  app.use(cors());
  app.use(express.json());

  // 健康检查端点
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      message: 'PeerJS信令服务器运行中',
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

/**
 * 设置用户管理 API 路由
 */
function setupUserRoutes(app) {
  // 在线用户列表
  const onlineUsers = new Map();

  // 固定配置
  const USER_TIMEOUT = 30000; // 30秒
  const HEARTBEAT_CHECK_INTERVAL = 10000; // 10秒

  // 用户注册
  app.post('/api/register', (req, res) => {
    const { peerId, username } = req.body;
    if (peerId && username) {
      onlineUsers.set(peerId, { username, lastHeartbeat: Date.now() });
      console.log(`📝 用户注册: ${username} (${peerId})`);
      res.json({ success: true, peerId });
    } else {
      res.status(400).json({ success: false, message: '缺少必要参数' });
    }
  });

  // 用户注销
  app.post('/api/unregister', (req, res) => {
    const { peerId } = req.body;
    if (peerId && onlineUsers.has(peerId)) {
      const user = onlineUsers.get(peerId);
      onlineUsers.delete(peerId);
      console.log(`👋 用户离线: ${user.username} (${peerId})`);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  });

  // 心跳接口
  app.post('/api/heartbeat', (req, res) => {
    const { peerId } = req.body;
    if (peerId && onlineUsers.has(peerId)) {
      const user = onlineUsers.get(peerId);
      user.lastHeartbeat = Date.now();
      onlineUsers.set(peerId, user);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: '用户不存在' });
    }
  });

  // 获取在线用户列表
  app.get('/api/users', (req, res) => {
    const users = Array.from(onlineUsers.entries()).map(([peerId, data]) => ({
      peerId,
      username: data.username
    }));
    res.json({ users });
  });

  // 清理超时用户
  setInterval(() => {
    const now = Date.now();

    for (const [peerId, data] of onlineUsers.entries()) {
      if (now - data.lastHeartbeat > USER_TIMEOUT) {
        console.log(`🧹 清理超时用户: ${data.username} (${peerId})`);
        onlineUsers.delete(peerId);
      }
    }
  }, HEARTBEAT_CHECK_INTERVAL);

  return onlineUsers;
}

/**
 * 创建 PeerJS 服务器
 */
function createPeerServer(options = {}) {
  const PEER_PORT = parseInt(process.env.SERVER_SIGNALING_PORT || '9000', 10);
  const PEER_PATH = process.env.SERVER_SIGNALING_PEER_PATH || '/myapp';

  const peerServer = PeerServer({
    port: options.port || PEER_PORT,
    path: options.path || PEER_PATH,
    ssl: options.ssl || undefined,
    allow_discovery: true,
    generateClientId: () => {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  });

  // 监听连接事件
  peerServer.on('connection', (client) => {
    console.log(`✅ 客户端已连接: ${client.getId()}`);
  });

  // 监听断开连接事件
  peerServer.on('disconnect', (client) => {
    console.log(`❌ 客户端已断开: ${client.getId()}`);
  });

  // 监听错误事件
  peerServer.on('error', (error) => {
    console.error('❗ PeerServer错误:', error);
  });

  return peerServer;
}

// 导出函数供其他文件使用
module.exports = {
  createApp,
  setupUserRoutes,
  createPeerServer
};

// 如果直接运行此文件，启动 HTTP 服务器
if (require.main === module) {
  const app = createApp();
  setupUserRoutes(app);
  const peerServer = createPeerServer();

  const PORT = parseInt(process.env.SERVER_API_PORT || '3001', 10);
  const PEER_PORT = parseInt(process.env.SERVER_SIGNALING_PORT || '9000', 10);
  const PEER_PATH = process.env.NEXT_PUBLIC_SERVER_SIGNALING_PEER_PATH || '/myapp';
  const HOST = '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log('🚀 ========================================');
    console.log(`🚀 PeerJS信令服务器已启动`);
    console.log(`🚀 HTTP API: http://localhost:${PORT}`);
    console.log(`🚀 PeerJS服务: ws://localhost:${PEER_PORT}${PEER_PATH}`);
    console.log('🚀 ========================================');
  });
}

