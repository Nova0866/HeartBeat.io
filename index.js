const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const PING_INTERVAL = 5 * 60 * 1000;
const SLOW_MS = parseInt(process.env.SLOW_MS || '2000');

// Parse PING_* env vars: value format = "Name | https://url.com"
const targets = Object.entries(process.env)
  .filter(([key]) => key.startsWith('PING_'))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, val]) => {
    const parts = val.split('|').map(s => s.trim());
    const name = parts[0] || key;
    const url  = parts[1] || parts[0];
    const pingUrl = url.endsWith('/ping') ? url : `${url}/ping`;
    return {
      key, name, url, pingUrl,
      status: 'pending',
      lastPing: null, lastPingMs: null,
      avgMs: null, history: [],
      startedAt: null,
    };
  });

if (targets.length === 0) {
  console.warn('No PING_* env vars found. Example: PING_1=Fern | https://fernbot.onrender.com');
}

function classifyStatus(ok, ms) {
  if (!ok) return 'down';
  if (ms > SLOW_MS) return 'slow';
  return 'up';
}

async function pingTarget(target) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(target.pingUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const ms = Date.now() - start;
    const newStatus = classifyStatus(res.ok, ms);

    const wasDown = target.status === 'down' || target.status === 'pending';
    if (wasDown && newStatus === 'up') target.startedAt = Date.now();
    if (newStatus === 'down') target.startedAt = null;

    target.status     = newStatus;
    target.lastPing   = Date.now();
    target.lastPingMs = ms;
    target.history.push(ms);
    if (target.history.length > 20) target.history.shift();
    target.avgMs = Math.round(target.history.reduce((a, b) => a + b, 0) / target.history.length);
    console.log(`✓ ${target.name} — ${ms}ms (${newStatus})`);
  } catch (err) {
    const newStatus = err.name === 'AbortError' ? 'slow' : 'down';
    if (newStatus === 'down') target.startedAt = null;
    target.status     = newStatus;
    target.lastPing   = Date.now();
    target.lastPingMs = null;
    console.error(`✗ ${target.name} — ${err.message}`);
  }
}

async function pingAll() {
  await Promise.allSettled(targets.map(pingTarget));
}

pingAll();
setInterval(pingAll, PING_INTERVAL);

// Self-ping to stay alive on Render free tier
setInterval(() => {
  fetch(`http://localhost:${PORT}/ping`)
    .then(() => console.log('Self-ping ok'))
    .catch(err => console.error('Self-ping failed:', err.message));
}, 10 * 60 * 1000);

// Routes
app.get('/ping', (req, res) => res.send('pong'));

app.get('/api/targets', (req, res) => {
  const now = Date.now();
  res.json(targets.map(t => ({
    name:        t.name,
    url:         t.url,
    status:      t.status,
    lastPingAgo: t.lastPing ? now - t.lastPing : null,
    lastPingMs:  t.lastPingMs,
    avgMs:       t.avgMs,
    startedAt:   t.startedAt,
  })));
});

app.get('/api/summary', (req, res) => {
  res.json({
    total:   targets.length,
    up:      targets.filter(t => t.status === 'up').length,
    slow:    targets.filter(t => t.status === 'slow').length,
    down:    targets.filter(t => t.status === 'down').length,
    pending: targets.filter(t => t.status === 'pending').length,
  });
});

// Public data endpoints for Discord bot / external consumers
app.get('/data', (req, res) => {
  const now = Date.now();
  res.json(targets.map(t => ({
    key:         t.key,
    name:        t.name,
    status:      t.status,
    avgMs:       t.avgMs,
    lastPingAgo: t.lastPing ? now - t.lastPing : null,
    startedAt:   t.startedAt,
  })));
});

app.get('/data/:botname', (req, res) => {
  const name = req.params.botname.toLowerCase();
  const target = targets.find(t => t.name.toLowerCase() === name || t.key.toLowerCase() === name);
  if (!target) return res.status(404).json({ error: 'Not found' });
  const now = Date.now();
  res.json({
    key:         target.key,
    name:        target.name,
    status:      target.status,
    avgMs:       target.avgMs,
    lastPingAgo: target.lastPing ? now - target.lastPing : null,
    startedAt:   target.startedAt,
  });
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`HeartBeat.io running on port ${PORT} | slow threshold: ${SLOW_MS}ms`);
  targets.forEach(t => console.log(`  • ${t.name} → ${t.pingUrl}`));

  // Start Discord bot if token is present
  if (process.env.DISCORD_TOKEN) {
    const { startBot } = require('./heartbeat');
    await startBot(targets).catch(err => console.error('Bot failed to start:', err.message));
  }
});
