const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function prepare(sql) {
  const pgSql = toPgSql(sql);
  const isInsert = /^\s*INSERT\s/i.test(pgSql);
  const hasReturning = /RETURNING\b/i.test(pgSql);

  const run = async (...params) => {
    const client = await getPool().connect();
    try {
      let finalSql = pgSql;
      if (isInsert && !hasReturning) {
        finalSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
      }
      const res = await client.query(finalSql, params);
      return {
        lastInsertRowid: res.rows?.[0]?.id || null,
        changes: res.rowCount || 0,
      };
    } finally {
      client.release();
    }
  };

  const get = async (...params) => {
    const client = await getPool().connect();
    try {
      const res = await client.query(pgSql, params);
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  };

  const all = async (...params) => {
    const client = await getPool().connect();
    try {
      const res = await client.query(pgSql, params);
      return res.rows;
    } finally {
      client.release();
    }
  };

  return { run, get, all };
}

async function exec(sql) {
  const client = await getPool().connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { getPool, prepare, exec, close };
