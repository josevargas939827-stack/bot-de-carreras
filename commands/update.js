const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveTrackAndLeaderboard } = require('../services/raceService');
const { describeGap } = require('../utils/timeUtils');

function iconForPosition(pos) {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  if (pos === 4 || pos === 5) return '🔥';
  return '•';
}

function formatLeaderboard(leaderboard) {
  return leaderboard.map((entry, idx) => {
    const pos = idx + 1;
    const icon = iconForPosition(pos);
    const label = pos.toString().padStart(2, ' ');
    return `${icon} ${label}. ${entry.name} — ${entry.timeRaw}`;
  }).join('\n');
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
