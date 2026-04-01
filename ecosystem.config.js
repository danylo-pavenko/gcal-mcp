module.exports = {
  apps: [
    {
      name: 'gcal-mcp',
      script: 'dist/main.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      output: 'logs/out.log',
      error: 'logs/err.log',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};
