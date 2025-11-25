const { createServer } = require('https');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3000;

// 初始化 Next.js app（当前目录就是 client 目录）
const app = next({ dev, dir: __dirname, hostname, port });
const handle = app.getRequestHandler();

// 读取 SSL 证书（在上级目录的 certs 文件夹）
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
};

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log('');
      console.log('🔐 ========================================');
      console.log('🔐 HTTPS Next.js 服务器已启动');
      console.log('🔐 ========================================');
      console.log('');
      console.log('  本地访问:   https://localhost:3000');
      console.log('  局域网访问: https://192.168.120.44:3000');
      console.log('');
      console.log('⚠️  首次访问会显示安全警告，点击"高级" → "继续访问"');
      console.log('');
      console.log(`  准备就绪 - 开始于 https://${hostname}:${port}`);
      console.log('');
    });
});

