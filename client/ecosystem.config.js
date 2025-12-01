module.exports = {
  apps: [{
    name: 'p2p-frontend',
    script: 'server.js', // 使用 HTTP 服务器
    instances: 1, // 只启动 1 个进程
    exec_mode: 'fork', // fork 模式（单进程）
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}