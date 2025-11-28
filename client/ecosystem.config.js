module.exports = {
  apps: [{
    name: 'p2p-frontend',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    instances: 'max', // 使用所有 CPU 核心
    exec_mode: 'cluster', // 集群模式
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