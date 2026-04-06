module.exports = {
  apps: [
    {
      name: 'zenith-bifrost',
      script: './src/index.js',
      cwd: './',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      max_restarts: 50,
      time: true,
      merge_logs: true,
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
