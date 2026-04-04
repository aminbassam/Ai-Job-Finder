module.exports = {
  apps: [
    {
      name: "jobflow-api",
      cwd: __dirname,
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      exp_backoff_restart_delay: 100,
      max_memory_restart: "350M",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
