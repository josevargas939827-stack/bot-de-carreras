const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildUsageStats, readHistory, HISTORY_RETENTION_DAYS } = require('../services/historyService');

function formatStatsLines(stats) {
  return stats
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.name} - ${item.count} uses (${item.percentage.toFixed(1)}%)`)
    .join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('powerup-stats')
    .setDescription('Show power-up usage percentages from the last 7 days.'),
  async execute(interaction) {
    await interaction.deferReply();

    const history = await readHistory();
    const stats = buildUsageStats(history, 'powerups');

    if (stats.length === 0) {
      await interaction.editReply(`No history data found for the last ${HISTORY_RETENTION_DAYS} days.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('\u26A1 Power-Up Usage (Last 7 Days)')
      .setColor(0x2563eb)
      .setDescription(formatStatsLines(stats))
      .setFooter({ text: `Based on ${history.length} leaderboard updates` })
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  },
};
