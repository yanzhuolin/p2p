const https = require('https');
const fs = require('fs');
const path = require('path');
const { createApp, setupUserRoutes, createPeerServer } = require('./server');

// 创建 Express 应用并设置路由
const app = createApp();
setupUserRoutes(app);

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

// 启动 HTTPS API 服务器
const PORT = process.env.PORT || 3001;
httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🔐 ========================================');
  console.log('🔐 HTTPS API 服务器已启动');
  console.log('🔐 ========================================');
  console.log('');
  console.log(`  本地访问:   https://localhost:${PORT}`);
  console.log(`  局域网访问: https://你的IP:${PORT}`);
  console.log('');
  console.log('⚠️  首次访问会显示安全警告，点击"高级" → "继续访问"');
  console.log('');
});

// 启动 PeerJS 信令服务器（HTTPS）
const PEER_PORT = process.env.PEER_PORT || 9000;
const peerServer = createPeerServer({
  port: PEER_PORT,
  path: '/myapp',
  ssl: sslOptions
});

console.log('🔐 ========================================');
console.log('🔐 PeerJS 信令服务器已启动');
console.log('🔐 ========================================');
console.log('');
console.log(`  本地访问:   wss://localhost:${PEER_PORT}`);
console.log(`  局域网访问: wss://你的IP:${PEER_PORT}`);
console.log('');

