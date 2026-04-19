const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveTrackAndLeaderboard } = require('../services/raceService');
const { getLatestTrackSnapshot } = require('../services/historyService');
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

function resolveThumbnail(entry) {
  const topCar = entry && entry.players[0] ? entry.players[0].car : null;
  return topCar ? carImages[topCar] : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show the latest saved leaderboard snapshot for the current track.'),
  async execute(interaction) {
    const { track } = await getActiveTrackAndLeaderboard();
    if (!track) {
      await interaction.editReply('There is no active race at the moment, so I cannot determine the current track.');
      return;
    }

    const latestEntry = await getLatestTrackSnapshot(track.name);
    if (!latestEntry) {
      await interaction.editReply(`No saved history found for ${track.name} in the last 7 days.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${track.name} - Latest Snapshot`)
      .setColor(0x0f766e)
      .setFooter({ text: 'Most recent saved update from the last 7 days' })
      .setTimestamp(new Date());

    const thumbnail = resolveThumbnail(latestEntry);
    if (thumbnail) {
      embed.setThumbnail(thumbnail);
    }

    embed.addFields({
      name: `Updated - ${new Date(latestEntry.timestamp).toLocaleString('en-US', { hour12: false })}`,
      value: formatHistoryEntry(latestEntry),
    });

    await interaction.editReply({ embeds: [embed] });
  },
};
