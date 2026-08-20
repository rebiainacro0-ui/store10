if (!process.env.DATABASE_URL) {
  console.log('No DATABASE_URL set, skipping PostgreSQL schema init');
  process.exit(0);
}

const { initPgSchema } = require('./schema-pg');

initPgSchema()
  .then(() => {
    console.log('PostgreSQL schema ready');
    process.exit(0);
  })
  .catch((err) => {
    console.error('PostgreSQL schema init failed (will be retried at runtime):', err.message);
    process.exit(0);
  });
