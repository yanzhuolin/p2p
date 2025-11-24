const { PeerServer } = require('peer');
const express = require('express');
const cors = require('cors');

const app = express();

// 启用CORS
app.use(cors());
app.use(express.json());

// 创建PeerJS服务器
const peerServer = PeerServer({
  port: 9000,
  path: '/myapp',
  // 允许发现其他peer
  allow_discovery: true,
  // 生成客户端ID
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

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'PeerJS信令服务器运行中',
    timestamp: new Date().toISOString()
  });
});

// 获取在线用户列表（简单实现）
const onlineUsers = new Map();

app.post('/api/register', (req, res) => {
  const { peerId, username } = req.body;
  if (peerId && username) {
    onlineUsers.set(peerId, { username, timestamp: Date.now() });
    console.log(`📝 用户注册: ${username} (${peerId})`);
    res.json({ success: true, peerId });
  } else {
    res.status(400).json({ success: false, message: '缺少必要参数' });
  }
});

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

app.get('/api/users', (req, res) => {
  const users = Array.from(onlineUsers.entries()).map(([peerId, data]) => ({
    peerId,
    username: data.username
  }));
  res.json({ users });
});

// 清理超时用户（5分钟无活动）
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5分钟
  
  for (const [peerId, data] of onlineUsers.entries()) {
    if (now - data.timestamp > timeout) {
      console.log(`⏰ 清理超时用户: ${data.username} (${peerId})`);
      onlineUsers.delete(peerId);
    }
  }
}, 60000); // 每分钟检查一次

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('🚀 ========================================');
  console.log(`🚀 PeerJS信令服务器已启动`);
  console.log(`🚀 HTTP API: http://localhost:${PORT}`);
  console.log(`🚀 PeerJS服务: ws://localhost:9000/myapp`);
  console.log('🚀 ========================================');
});

