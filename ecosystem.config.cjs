module.exports = {
  apps: [
    {
      name: 'backforge-api',
      script: 'dist/server/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'api',
        PORT: 3000,
        ENABLE_CLUSTER: 'false',
      },
    },
    {
      name: 'backforge-worker',
      script: 'dist/server/queues/worker.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'worker',
      },
    },
  ],
};
