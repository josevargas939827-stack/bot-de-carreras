const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveTrackAndLeaderboard } = require('../services/raceService');
const { HISTORY_RETENTION_DAYS } = require('../services/historyService');
const { getTrackMetaStats } = require('../services/statsService');

function formatStatsLines(stats) {
  return stats
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.name} - ${item.percentage.toFixed(1)}% (${item.count})`)
    .join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('powerup-stats')
    .setDescription('Show power-up usage percentages from the active track history.'),
  async execute(interaction) {
    const { track } = await getActiveTrackAndLeaderboard();
    if (!track) {
      await interaction.editReply('There is no active race at the moment.');
      return;
    }

    const { powerups, entries } = await getTrackMetaStats(track.name, { days: HISTORY_RETENTION_DAYS });

    if (powerups.length === 0) {
      await interaction.editReply(`No history data found for ${track.name} in the last ${HISTORY_RETENTION_DAYS} days.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('\u26A1 Power-Up Usage (Last 7 Days)')
      .setColor(0x2563eb)
      .setDescription(formatStatsLines(powerups))
      .setFooter({ text: `${track.name} | Based on ${entries.length} snapshots` })
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  },
};
