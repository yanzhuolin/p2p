module.exports = {
  apps: [
    {
      name: 'p2p-backend',
      script: 'server-https.js', // 使用 HTTPS 服务器
      instances: 1,
      exec_mode: 'fork', // fork 模式（单进程）
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
}

