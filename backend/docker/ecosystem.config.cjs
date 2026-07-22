// pm2 process manifest for the backend container. The API and the background
// worker are two Node processes managed by a single pm2-runtime (PID 1).
module.exports = {
  apps: [
    {
      name: 'erp-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'erp-worker',
      script: 'dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '384M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
