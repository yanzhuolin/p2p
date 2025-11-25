const { PeerServer } = require('peer');
const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 用户注册表
const users = new Map();
const userHeartbeats = new Map();

// API 路由
app.post('/api/register', (req, res) => {
  const { peerId, username } = req.body;
  users.set(peerId, { peerId, username, timestamp: Date.now() });
  userHeartbeats.set(peerId, Date.now());
  console.log(`✅ 用户注册: ${username} (${peerId})`);
  res.json({ success: true });
});

app.post('/api/unregister', (req, res) => {
  const { peerId } = req.body;
  const user = users.get(peerId);
  if (user) {
    console.log(`👋 用户注销: ${user.username} (${peerId})`);
  }
  users.delete(peerId);
  userHeartbeats.delete(peerId);
  res.json({ success: true });
});

app.get('/api/users', (req, res) => {
  const userList = Array.from(users.values());
  res.json({ users: userList });
});

app.post('/api/heartbeat', (req, res) => {
  const { peerId } = req.body;
  userHeartbeats.set(peerId, Date.now());
  res.json({ success: true });
});

// 清理超时用户
setInterval(() => {
  const now = Date.now();
  const timeout = 30000; // 30秒
  
  userHeartbeats.forEach((lastHeartbeat, peerId) => {
    if (now - lastHeartbeat > timeout) {
      const user = users.get(peerId);
      if (user) {
        console.log(`⏰ 用户超时: ${user.username} (${peerId})`);
      }
      users.delete(peerId);
      userHeartbeats.delete(peerId);
    }
  });
}, 10000);

// 检查证书文件是否存在
const certPath = path.join(__dirname, '../certs/cert.pem');
const keyPath = path.join(__dirname, '../certs/key.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('❌ 错误：未找到 SSL 证书文件！');
  console.error('');
  console.error('请先生成证书：');
  console.error('  1. 运行: chmod +x setup-https.sh');
  console.error('  2. 运行: ./setup-https.sh');
  console.error('');
  console.error('或者手动创建：');
  console.error('  mkdir -p certs');
  console.error('  cd certs');
  console.error('  openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes');
  console.error('');
  process.exit(1);
}

// 读取 SSL 证书
const sslOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
};

// 创建 HTTPS 服务器
const httpsServer = https.createServer(sslOptions, app);

// 启动 API 服务器
httpsServer.listen(3001, '0.0.0.0', () => {
  console.log('');
  console.log('🔐 ========================================');
  console.log('🔐 HTTPS API 服务器已启动');
  console.log('🔐 ========================================');
  console.log('');
  console.log('  本地访问:   https://localhost:3001');
  console.log('  局域网访问: https://你的IP:3001');
  console.log('');
  console.log('⚠️  首次访问会显示安全警告，点击"高级" → "继续访问"');
  console.log('');
});

// 启动 PeerJS 信令服务器（HTTPS）
const peerServer = PeerServer({
  port: 9000,
  path: '/myapp',
  ssl: sslOptions
});

peerServer.on('connection', (client) => {
  console.log('🔗 新的 Peer 连接:', client.getId());
});

peerServer.on('disconnect', (client) => {
  console.log('❌ Peer 断开:', client.getId());
});

console.log('🔐 ========================================');
console.log('🔐 PeerJS 信令服务器已启动');
console.log('🔐 ========================================');
console.log('');
console.log('  本地访问:   wss://localhost:9000');
console.log('  局域网访问: wss://你的IP:9000');
console.log('');

