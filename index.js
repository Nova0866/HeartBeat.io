const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const PING_INTERVAL = 5 * 60 * 1000;

// Parse PING_* env vars: value format = "Name | https://url.com"
const targets = Object.entries(process.env)
  .filter(([key]) => key.startsWith('PING_'))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, val]) => {
    const parts = val.split('|').map(s => s.trim());
    const name = parts[0] || key;
    const url = parts[1] || parts[0];
    return { key, name, url, status: 'pending', lastPing: null, lastPingMs: null, avgMs: null, history: [] };
  });

if (targets.length === 0) {
  console.warn('No PING_* env vars found. Add some like: PING_1=Fern | https://fernbot.onrender.com');
}

async function pingTarget(target) {
  const start = Date.now();
  try {
    const pingUrl = target.url.endsWith('/ping') ? target.url : `${target.url}/ping`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(pingUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const ms = Date.now() - start;
    target.status = res.ok ? 'up' : 'slow';
    target.lastPing = Date.now();
    target.lastPingMs = ms;
    target.history.push(ms);
    if (target.history.length > 10) target.history.shift();
    target.avgMs = Math.round(target.history.reduce((a, b) => a + b, 0) / target.history.length);
    console.log(`✓ ${target.name} — ${ms}ms`);
  } catch (err) {
    const ms = Date.now() - start;
    target.status = err.name === 'AbortError' ? 'slow' : 'down';
    target.lastPing = Date.now();
    target.lastPingMs = null;
    console.error(`✗ ${target.name} — ${err.message}`);
  }
}

async function pingAll() {
  await Promise.allSettled(targets.map(pingTarget));
}

// Initial ping then repeat
pingAll();
setInterval(pingAll, PING_INTERVAL);

// Self-ping to stay alive
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
    name: t.name,
    url: t.url,
    status: t.status,
    lastPingAgo: t.lastPing ? now - t.lastPing : null,
    lastPingMs: t.lastPingMs,
    avgMs: t.avgMs,
  })));
});

app.get('/api/summary', (req, res) => {
  res.json({
    total: targets.length,
    up: targets.filter(t => t.status === 'up').length,
    slow: targets.filter(t => t.status === 'slow').length,
    down: targets.filter(t => t.status === 'down').length,
    pending: targets.filter(t => t.status === 'pending').length,
  });
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HeartBeatIO running on port ${PORT}`);
  console.log(`Watching ${targets.length} target(s):`);
  targets.forEach(t => console.log(`  • ${t.name} → ${t.url}`));
});
