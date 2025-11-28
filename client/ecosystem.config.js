module.exports = {
  apps: [{
    name: 'p2p-frontend',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    instances: 1, // 只启动 1 个进程
    exec_mode: 'fork', // fork 模式（单进程）
    autorestart: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}