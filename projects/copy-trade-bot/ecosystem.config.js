module.exports = {
  apps: [
    {
      name: 'copy-trade-bot',
      script: 'src/index.ts',
      interpreter: './node_modules/.bin/ts-node',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      // Restart on failure with exponential backoff
      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
