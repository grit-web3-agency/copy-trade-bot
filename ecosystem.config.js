module.exports = {
  apps: [
    {
      name: 'copy-trade-bot',
      cwd: __dirname,
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm Z',
    },
  ],
};
