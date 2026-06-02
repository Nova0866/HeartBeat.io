// db.js — Turso scaffold
// Env vars needed: TURSO_URL, TURSO_TOKEN

let client = null;

function getClient() {
  if (client) return client;
  const { createClient } = require('@libsql/client');
  client = createClient({
    url: process.env.TURSO_URL || 'file:local.db',
    authToken: process.env.TURSO_TOKEN,
  });
  return client;
}

async function initDB() {
  const db = getClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bots (
      key            TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      discord_id     TEXT,
      discord_status TEXT DEFAULT 'offline',
      started_at     INTEGER,
      last_seen      INTEGER
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  console.log('DB ready');
}

// Upsert on recovery — only resets started_at, preserves existing row otherwise
async function setBotStartedAt(key, name, discordId, startedAt) {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO bots (key, name, discord_id, started_at, last_seen)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            started_at = excluded.started_at,
            last_seen  = excluded.last_seen,
            discord_id = excluded.discord_id`,
    args: [key, name, discordId, startedAt, startedAt],
  });
}

async function setBotDiscordStatus(key, status) {
  const db = getClient();
  await db.execute({
    sql: `UPDATE bots SET discord_status = ? WHERE key = ?`,
    args: [status, key],
  });
}

async function touchBot(key, lastSeen) {
  const db = getClient();
  await db.execute({
    sql: `UPDATE bots SET last_seen = ? WHERE key = ?`,
    args: [lastSeen, key],
  });
}

async function setBotOffline(key) {
  const db = getClient();
  await db.execute({
    sql: `UPDATE bots SET started_at = NULL, discord_status = 'offline' WHERE key = ?`,
    args: [key],
  });
}

async function getBot(key) {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT * FROM bots WHERE key = ?`,
    args: [key],
  });
  return result.rows[0] || null;
}

async function getAllBots() {
  const db = getClient();
  const result = await db.execute(`SELECT * FROM bots`);
  return result.rows;
}

async function getMeta(key) {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT value FROM meta WHERE key = ?`,
    args: [key],
  });
  return result.rows[0]?.value || null;
}

async function setMeta(key, value) {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO meta (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, String(value)],
  });
}

module.exports = {
  getClient,
  initDB,
  setBotStartedAt,
  setBotDiscordStatus,
  touchBot,
  setBotOffline,
  getBot,
  getAllBots,
  getMeta,
  setMeta,
};
