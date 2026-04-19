const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { TRACKING_INTERVAL_MS, getTrackingStatus } = require('../services/trackingScheduler');

function formatTimestamp(value) {
  if (!value) {
    return 'Never';
  }

  return new Date(value).toLocaleString('en-US', { hour12: false });
}

function formatTopStat(label, item) {
  if (!item) {
    return `${label}: No data`;
  }

  return `${label}: ${item.name} (${item.percentage.toFixed(1)}%)`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tracker-status')
    .setDescription('Show the latest automatic tracking status.'),
  async execute(interaction) {
    await interaction.deferReply();

    const status = getTrackingStatus();

    const embed = new EmbedBuilder()
      .setTitle('Tracker Status')
      .setColor(status.status === 'error' ? 0xdc2626 : 0x16a34a)
      .addFields(
        { name: 'Scheduler', value: status.intervalActive ? 'Active' : 'Stopped', inline: true },
        { name: 'Running Now', value: status.isRunning ? 'Yes' : 'No', inline: true },
        { name: 'Interval', value: `${TRACKING_INTERVAL_MS} ms`, inline: true },
        { name: 'Last Status', value: status.status, inline: true },
        { name: 'Last Started', value: formatTimestamp(status.startedAt), inline: true },
        { name: 'Last Finished', value: formatTimestamp(status.finishedAt), inline: true },
      )
      .setTimestamp(new Date());

    if (status.track) {
      embed.addFields(
        { name: 'Track', value: status.track.name, inline: true },
        { name: 'Drivers', value: String(status.driverCount || 0), inline: true },
        { name: 'Saved Snapshot', value: status.saved ? 'Yes' : `No (${status.saveReason || 'unknown'})`, inline: true },
      );
    }

    if (status.progressText) {
      embed.addFields({ name: 'Race Progress', value: status.progressText });
    }

    if (status.statsSummary) {
      embed.addFields({
        name: 'Meta Summary',
        value: [
          `Snapshots: ${status.statsSummary.snapshots}`,
          formatTopStat('Top Car', status.statsSummary.topCar),
          formatTopStat('Top Power-up', status.statsSummary.topPowerup),
        ].join('\n'),
      });
    }

    if (status.errorMessage) {
      embed.addFields({ name: 'Last Error', value: status.errorMessage });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
