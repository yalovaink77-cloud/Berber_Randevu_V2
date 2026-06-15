module.exports = {
  apps: [
    {
      name: 'berber-randevu',
      script: 'index.js',
      instances: 'max',       // CPU sayısı kadar worker
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
