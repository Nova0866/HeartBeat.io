// commands.js — slash command definitions + interaction handler

const { SlashCommandBuilder } = require('discord.js');
const { buildMonitorContainer, buildSelectorContainer, buildDetailContainer, cv2Flags } = require('./embeds');
const { getMeta, setMeta, getBot, getAllBots } = require('./db');

const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID;
const PAGE_SIZE = 10;

let _targets = [];
function init(targets) { _targets = targets; }

async function buildMerged() {
  const dbBots = await getAllBots();
  const dbMap = Object.fromEntries(dbBots.map(b => [b.key, b]));
  return _targets.map(t => ({ target: t, dbBot: dbMap[t.key] || null }));
}

function paginate(arr, page) {
  const total = Math.max(1, Math.ceil(arr.length / PAGE_SIZE));
  const clamped = Math.min(Math.max(1, page), total);
  const slice = arr.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);
  return { slice, total, page: clamped };
}

const heartbeatCommand = new SlashCommandBuilder()
  .setName('heartbeat')
  .setDescription('HeartBeat bot monitor')
  .addSubcommand(sub =>
    sub.setName('monitor')
      .setDescription('Send the live monitor embed to this channel')
  )
  .addSubcommand(sub =>
    sub.setName('selector')
      .setDescription('Send a bot selector — pick one to get a DM status report')
  );

async function handleMonitor(interaction) {
  if (interaction.user.id !== ALLOWED_USER_ID) {
    return interaction.reply({ content: 'Not authorised.', ephemeral: true });
  }

  await interaction.deferReply();

  const merged = await buildMerged();
  const { slice, total, page } = paginate(merged, 1);
  const container = buildMonitorContainer(slice, page, total, Date.now());

  const msg = await interaction.editReply({
    components: [container],
    flags: cv2Flags(),
  });

  await setMeta('monitor_message_id', msg.id);
  await setMeta('monitor_channel_id', interaction.channelId);

  startMonitorInterval(interaction.client, interaction.channelId, msg.id, 1);
}

async function handleSelector(interaction) {
  const merged = await buildMerged();
  const container = buildSelectorContainer(merged.map(m => m.target));

  await interaction.reply({
    components: [container],
    flags: cv2Flags(),
  });
}

async function handleInteraction(interaction) {
  // Slash commands
  if (interaction.isChatInputCommand() && interaction.commandName === 'heartbeat') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'monitor') return handleMonitor(interaction);
    if (sub === 'selector') return handleSelector(interaction);
    return;
  }

  // Buttons
  if (interaction.isButton()) {
    const id = interaction.customId;

    // monitor_refresh_<page>
    if (id.startsWith('monitor_refresh_')) {
      await interaction.deferUpdate();
      const page = parseInt(id.split('_').pop()) || 1;
      return refreshMonitorMessage(interaction.client, interaction.channelId, interaction.message.id, page);
    }

    // monitor_prev_<page> / monitor_next_<page>
    if (id.startsWith('monitor_prev_') || id.startsWith('monitor_next_')) {
      await interaction.deferUpdate();
      const currentPage = parseInt(id.split('_').pop()) || 1;
      const newPage = id.startsWith('monitor_prev_') ? currentPage - 1 : currentPage + 1;
      return refreshMonitorMessage(interaction.client, interaction.channelId, interaction.message.id, newPage);
    }

    // detail_refresh_<key>
    if (id.startsWith('detail_refresh_')) {
      await interaction.deferUpdate();
      const key = id.replace('detail_refresh_', '');
      const target = _targets.find(t => t.key === key);
      if (!target) return;
      const dbBot = await getBot(key);
      const container = buildDetailContainer(target, dbBot);
      return interaction.editReply({
        components: [container],
        flags: cv2Flags(),
      });
    }

    if (id === 'selector_refresh') {
      await interaction.deferUpdate();
      const merged = await buildMerged();
      const container = buildSelectorContainer(merged.map(m => m.target));
      return interaction.editReply({
        components: [container],
        flags: cv2Flags(),
      });
    }
  }

  // Select menu — DM the selected bot's detail
  if (interaction.isStringSelectMenu() && interaction.customId === 'selector_pick') {
    // Defer ephemerally upfront so editReply inherits ephemeral correctly
    await interaction.deferReply({ ephemeral: true });

    const key = interaction.values[0];
    const target = _targets.find(t => t.key === key);
    if (!target) {
      return interaction.editReply({ content: 'Bot not found.' });
    }

    const dbBot = await getBot(key);
    const container = buildDetailContainer(target, dbBot);

    try {
      await interaction.user.send({
        components: [container],
        flags: cv2Flags(),
      });
      await interaction.editReply({ content: 'Check your DMs!' });
    } catch {
      await interaction.editReply({ content: 'Could not send DM. Check your privacy settings.' });
    }
  }
}

// Auto-edit interval — tracks current page per message
let monitorInterval = null;
let _currentPage = 1;

function startMonitorInterval(client, channelId, messageId, page = 1) {
  if (monitorInterval) clearInterval(monitorInterval);
  _currentPage = page;

  monitorInterval = setInterval(async () => {
    await refreshMonitorMessage(client, channelId, messageId, _currentPage);
  }, 60 * 1000);
}

async function refreshMonitorMessage(client, channelId, messageId, page) {
  try {
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);
    const merged = await buildMerged();
    const { slice, total, page: clampedPage } = paginate(merged, page);
    _currentPage = clampedPage;
    const container = buildMonitorContainer(slice, clampedPage, total, Date.now());
    await message.edit({
      components: [container],
      flags: cv2Flags(),
    });
  } catch (err) {
    console.error('Monitor refresh failed:', err.message);
  }
}

async function resumeMonitorInterval(client) {
  const messageId = await getMeta('monitor_message_id');
  const channelId = await getMeta('monitor_channel_id');
  if (messageId && channelId) {
    console.log(`Resuming monitor interval → message ${messageId}`);
    startMonitorInterval(client, channelId, messageId, 1);
  }
}

module.exports = { heartbeatCommand, handleInteraction, resumeMonitorInterval, init };
