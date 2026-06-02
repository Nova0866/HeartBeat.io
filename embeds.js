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
    ? `online for ${uptime}`
    : target.status === 'down' ? 'offline' : 'checking...';

  return `${server} **${target.name}** — discord: ${discord} ${discordLabel} | server: ${latency} | ${uptimeStr}`;
}

// Components v2 flag — pass as flags in the message options
function cv2Flags() {
  return MessageFlags.IsComponentsV2;
}

function buildMonitorContainer(merged, page, totalPages, lastUpdated) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## HeartBeat Monitor\nPage ${page} of ${totalPages} · updated <t:${Math.floor(lastUpdated / 1000)}:R>`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  for (const { target, dbBot } of merged) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(formatTarget(target, dbBot))
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

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

  const server       = STATUS_EMOJI[target.status] ?? '⚫';
  const discord      = DISCORD_EMOJI[dbBot?.discord_status ?? 'offline'];
  const discordLabel = DISCORD_LABEL[dbBot?.discord_status ?? 'offline'];
  const uptime       = dbBot?.started_at ? onlineFor(dbBot.started_at) : null;
  const uptimeStr    = uptime ? `online for ${uptime}` : 'not tracked yet';

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${target.name}\n` +
      `${server} Server: **${target.status}**${target.avgMs ? ` | avg ${target.avgMs}ms` : ''}\n` +
      `${discord} Discord: **${discordLabel}**\n` +
      uptimeStr
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
