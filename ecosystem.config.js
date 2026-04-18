module.exports = {
  apps: [
    {
      name: 'copy-trade-bot',
      cwd: __dirname,
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        SOLANA_NETWORK: 'devnet',
        ENABLE_LIVE_DEVNET: 'false',
      },
      env_devnet: {
        NODE_ENV: 'production',
        SOLANA_NETWORK: 'devnet',
        ENABLE_LIVE_DEVNET: 'true',
      },
      env_live: {
        NODE_ENV: 'production',
        SOLANA_NETWORK: 'devnet',
        ENABLE_LIVE_DEVNET: 'true',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
    },
  ],
};
