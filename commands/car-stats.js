const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveTrackAndLeaderboard } = require('../services/raceService');
const { HISTORY_RETENTION_DAYS } = require('../services/historyService');
const { getTrackMetaStats } = require('../services/statsService');
const carImages = require('../data/carImages');

function formatStatsLines(stats) {
  return stats
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.name} - ${item.percentage.toFixed(1)}% (${item.count})`)
    .join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('car-stats')
    .setDescription('Show car usage percentages from the active track history.'),
  async execute(interaction) {
    await interaction.deferReply();

    const { track } = await getActiveTrackAndLeaderboard();
    if (!track) {
      await interaction.editReply('There is no active race at the moment.');
      return;
    }

    const { cars, entries } = await getTrackMetaStats(track.name, { days: HISTORY_RETENTION_DAYS });

    if (cars.length === 0) {
      await interaction.editReply(`No history data found for ${track.name} in the last ${HISTORY_RETENTION_DAYS} days.`);
      return;
    }

    const topCarImage = carImages[cars[0].name];
    const embed = new EmbedBuilder()
      .setTitle('\u{1F697} Car Usage (Last 7 Days)')
      .setColor(0xea580c)
      .setDescription(formatStatsLines(cars))
      .setFooter({ text: `${track.name} | Based on ${entries.length} snapshots` })
      .setTimestamp(new Date());

    if (topCarImage) {
      embed.setThumbnail(topCarImage);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
