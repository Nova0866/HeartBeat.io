// heartbeat.js — Discord bot init, presence tracking, command registration

const { Client, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const { initDB, setBotStartedAt, setBotOffline, setBotDiscordStatus } = require('./db');
const { handleInteraction, heartbeatCommand, resumeMonitorInterval, init: initCommands } = require('./commands');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const GUILD_ID      = process.env.DISCORD_GUILD_ID;
const BOT_IDS       = parseBotIDs();

// DISCORD_BOT_IDS=PING_1:123456789,PING_2:987654321
function parseBotIDs() {
  const raw = process.env.DISCORD_BOT_IDS || '';
  const map = {};
  for (const pair of raw.split(',')) {
    const [key, id] = pair.split(':').map(s => s.trim());
    if (key && id) map[key] = id;
  }
  return map;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.GuildMember],
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: [heartbeatCommand.toJSON()] }
    );
    console.log('Slash commands registered');
  } catch (err) {
    console.error('Command registration failed:', err.message);
  }
}

function resolveStatus(presence) {
  if (!presence) return 'offline';
  return presence.status ?? 'offline';
}

function keyForDiscordId(discordId) {
  return Object.entries(BOT_IDS).find(([, id]) => id === discordId)?.[0] ?? null;
}

client.once('ready', async () => {
  console.log(`Discord bot ready: ${client.user.tag}`);

  await initDB();

  // Seed presence state on startup without overwriting existing started_at
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();

    for (const [key, discordId] of Object.entries(BOT_IDS)) {
      const member = guild.members.cache.get(discordId);
      const status = resolveStatus(member?.presence);

      await setBotDiscordStatus(key, status);

      if (status === 'offline') {
        await setBotOffline(key);
      }
      // If online, we only stamp started_at if there isn't one already
      // (don't overwrite a legitimate uptime on HeartBeat restart)
      else {
        const { getBot } = require('./db');
        const existing = await getBot(key);
        if (!existing?.started_at) {
          await setBotStartedAt(key, key, discordId, Date.now());
        }
      }
    }
  } catch (err) {
    console.error('Presence seed failed:', err.message);
  }

  await resumeMonitorInterval(client);
});

client.on('presenceUpdate', async (oldPresence, newPresence) => {
  const discordId = newPresence?.userId;
  if (!discordId) return;

  const key = keyForDiscordId(discordId);
  if (!key) return;

  const oldStatus = resolveStatus(oldPresence);
  const newStatus = resolveStatus(newPresence);

  if (oldStatus === newStatus) return;

  console.log(`Presence: ${key} ${oldStatus} -> ${newStatus}`);

  if (oldStatus === 'offline' && newStatus !== 'offline') {
    await setBotStartedAt(key, key, discordId, Date.now());
  }

  if (newStatus === 'offline') {
    await setBotOffline(key);
  } else {
    await setBotDiscordStatus(key, newStatus);
  }
});

client.on('interactionCreate', handleInteraction);

async function startBot(targets) {
  if (!DISCORD_TOKEN) {
    console.warn('DISCORD_TOKEN not set — bot disabled');
    return;
  }
  initCommands(targets);
  await registerCommands();
  await client.login(DISCORD_TOKEN);
}

module.exports = { startBot };
