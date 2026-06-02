// embeds.js — Components v2 builders
// Requires discord.js v14.18+

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  MessageFlags,
  SeparatorSpacingSize,
} = require('discord.js');

const STATUS_EMOJI  = { up: '🟢', slow: '🟡', down: '🔴', pending: '⚫' };
const DISCORD_EMOJI = { online: '●', idle: '◑', dnd: '⊘', offline: '○' };
const DISCORD_LABEL = { online: 'online', idle: 'idle', dnd: 'dnd', offline: 'offline' };

function onlineFor(startedAt) {
  if (!startedAt) return null;
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function formatTarget(target, dbBot) {
  const server       = STATUS_EMOJI[target.status] ?? '⚫';
  const discord      = DISCORD_EMOJI[dbBot?.discord_status ?? 'offline'];
  const discordLabel = DISCORD_LABEL[dbBot?.discord_status ?? 'offline'];
  const latency      = target.avgMs ? `${target.avgMs}ms` : '—';
  const uptime       = dbBot?.started_at ? onlineFor(dbBot.started_at) : null;
  const uptimeStr    = uptime
    ? `${uptime}`
    : target.status === 'down' ? 'offline' : 'pending';

  return {
    name: target.name,
    server: { status: server, label: target.status, latency },
    discord: { emoji: discord, label: discordLabel },
    uptime: uptimeStr,
  };
}

// Components v2 flag — pass as flags in the message options
function cv2Flags() {
  return MessageFlags.IsComponentsV2;
}

function buildMonitorContainer(merged, page, totalPages, lastUpdated) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## HeartBeat Monitor\nPage ${page}/${totalPages} · <t:${Math.floor(lastUpdated / 1000)}:R>`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  for (const { target, dbBot } of merged) {
    const stats = formatTarget(target, dbBot);

    // Header with name and server status
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${stats.server.status} ${stats.name}**`
      )
    );

    // Details in a readable format
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `• Server: ${stats.server.label} (${stats.server.latency})\n` +
        `• Discord: ${stats.discord.emoji} ${stats.discord.label}\n` +
        `• Online: ${stats.uptime}`
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
  }

  const row = new ActionRowBuilder();

  if (totalPages > 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`monitor_prev_${page}`)
        .setLabel('← Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`monitor_next_${page}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`monitor_refresh_${page}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Primary)
  );

  container.addActionRowComponents(row);

  return container;
}

function buildSelectorContainer(targets) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## Bot Selector\nSelect a bot to get its status in your DMs.'
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId('selector_pick')
    .setPlaceholder('Choose a bot...')
    .addOptions(
      targets.map(t =>
        new StringSelectMenuOptionBuilder()
          .setLabel(t.name)
          .setValue(t.key)
          .setDescription(`${STATUS_EMOJI[t.status] ?? '⚫'} ${t.status}`)
      )
    );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(select)
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('selector_refresh')
        .setLabel('Rebuild list')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return container;
}

function buildDetailContainer(target, dbBot) {
  const container = new ContainerBuilder();

  const stats = formatTarget(target, dbBot);

  // Title
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${stats.name}`)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  // Server status
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Server Status**\n` +
      `${stats.server.status} ${stats.server.label}\n` +
      `Latency: ${stats.server.latency}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  // Discord status
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Discord Status**\n` +
      `${stats.discord.emoji} ${stats.discord.label}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  // Uptime
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Uptime**\n` +
      `${stats.uptime}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`detail_refresh_${target.key}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Primary)
    )
  );

  return container;
}

module.exports = {
  buildMonitorContainer,
  buildSelectorContainer,
  buildDetailContainer,
  cv2Flags,
  onlineFor,
};
