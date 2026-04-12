module.exports = {
  apps: [
    {
      name: 'quran-admin-backend',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
      },
    },
  ],
};
