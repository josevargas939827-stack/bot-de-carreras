const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveTrackAndLeaderboard } = require('../services/raceService');
const { saveLeaderboardHistory } = require('../services/historyService');
const { describeGap } = require('../utils/timeUtils');

function iconForPosition(pos) {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  if (pos === 4 || pos === 5) return '🔥';
  return '•';
}

function formatEntry(entry, idx) {
  const pos = idx + 1;
  const icon = iconForPosition(pos);
  const powerupsDisplay = entry.powerups && entry.powerups.length > 0 ? entry.powerups.join(', ') : 'No Power-ups';
  const carDisplay = entry.car || 'Unknown Car';
  const timeDisplay = entry.time || 'Unknown time';

  return [
    `${icon} ${pos}. ${entry.name}`,
    `🚗 ${carDisplay}`,
    `⚡ ${powerupsDisplay}`,
    `⏱️ ${timeDisplay}`,
  ].join('\n');
}

function formatLeaderboard(leaderboard) {
  return leaderboard.map((entry, idx) => formatEntry(entry, idx)).join('\n\n');
}

function buildGapLine(leaderboard) {
  if (!leaderboard || leaderboard.length < 2) return null;
  const p1 = leaderboard[0];
  const p2 = leaderboard[1];
  const gapInfo = describeGap(p1.timeSeconds, p2.timeSeconds);
  if (!gapInfo) return null;
  return `${p1.name} ${gapInfo.text}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pilotupdate')
    .setDescription('Show the active Upland race leaderboard.'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const { track, leaderboard } = await getActiveTrackAndLeaderboard();

    if (!track || leaderboard.length === 0) {
      await interaction.editReply('There is no active race at the moment.');
      return;
    }

    await saveLeaderboardHistory(track, leaderboard);

    const gapLine = buildGapLine(leaderboard);
    const embed = new EmbedBuilder()
      .setTitle(`${track.name} — Top 18`)
      .setDescription(formatLeaderboard(leaderboard))
      .setColor(0x14b8a6)
      .setFooter({ text: 'Upland Racing | /pilotupdate' })
      .setTimestamp(new Date());

    if (gapLine) {
      embed.addFields({ name: 'Gap Analysis', value: gapLine });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
