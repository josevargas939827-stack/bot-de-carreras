const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildUsageStats, readHistory, HISTORY_RETENTION_DAYS } = require('../services/historyService');
const carImages = require('../data/carImages');

function formatStatsLines(stats) {
  return stats
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.name} - ${item.count} uses (${item.percentage.toFixed(1)}%)`)
    .join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('car-stats')
    .setDescription('Show car usage percentages from the last 7 days.'),
  async execute(interaction) {
    await interaction.deferReply();

    const history = await readHistory();
    const stats = buildUsageStats(history, 'car');

    if (stats.length === 0) {
      await interaction.editReply(`No history data found for the last ${HISTORY_RETENTION_DAYS} days.`);
      return;
    }

    const topCarImage = carImages[stats[0].name];
    const embed = new EmbedBuilder()
      .setTitle('\u{1F697} Car Usage (Last 7 Days)')
      .setColor(0xea580c)
      .setDescription(formatStatsLines(stats))
      .setFooter({ text: `Based on ${history.length} leaderboard updates` })
      .setTimestamp(new Date());

    if (topCarImage) {
      embed.setThumbnail(topCarImage);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
