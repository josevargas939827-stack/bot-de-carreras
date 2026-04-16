const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveTrackAndLeaderboard } = require('../services/raceService');
const { getTrackHistory } = require('../services/historyService');
const carImages = require('../data/carImages');

function formatPlayer(player, index) {
  const powerups = Array.isArray(player.powerups) && player.powerups.length > 0
    ? player.powerups.join(', ')
    : 'No Power-ups';

  return `${index + 1}. ${player.name} | ${player.car} | ${powerups} | ${player.time}`;
}

function formatHistoryEntry(entry) {
  const lines = entry.players.slice(0, 5).map(formatPlayer);
  const overflow = entry.players.length > 5 ? `\n...and ${entry.players.length - 5} more racers` : '';
  return `${lines.join('\n')}${overflow}`;
}

function resolveThumbnail(historyEntries) {
  const topCar = historyEntries[0] && historyEntries[0].players[0] ? historyEntries[0].players[0].car : null;
  return topCar ? carImages[topCar] : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show the 3 latest leaderboard updates for the current track.'),
  async execute(interaction) {
    await interaction.deferReply();

    const { track } = await getActiveTrackAndLeaderboard();
    if (!track) {
      await interaction.editReply('There is no active race at the moment, so I cannot determine the current track.');
      return;
    }

    const historyEntries = await getTrackHistory(track.name, 3);
    if (historyEntries.length === 0) {
      await interaction.editReply(`No saved history found for ${track.name} in the last 7 days.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${track.name} - Recent History`)
      .setColor(0x0f766e)
      .setFooter({ text: 'Latest 3 updates from the last 7 days' })
      .setTimestamp(new Date());

    const thumbnail = resolveThumbnail(historyEntries);
    if (thumbnail) {
      embed.setThumbnail(thumbnail);
    }

    embed.addFields(
      ...historyEntries.map((entry, index) => ({
        name: `Update ${index + 1} - ${new Date(entry.timestamp).toLocaleString('en-US', { hour12: false })}`,
        value: formatHistoryEntry(entry),
      }))
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
