import pg from "pg";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}
