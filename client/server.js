const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// 初始化 Next.js app（当前目录就是 client 目录）
const app = next({ dev, dir: __dirname, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
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
      console.log('🚀 ========================================');
      console.log('🚀 HTTP Next.js 服务器已启动');
      console.log('🚀 ========================================');
      console.log('');
      console.log(`  本地访问:   http://localhost:${port}`);
      console.log(`  局域网访问: http://${hostname}:${port}`);
      console.log('');
      console.log(`  准备就绪 - 开始于 http://${hostname}:${port}`);
      console.log('');
    });
});

