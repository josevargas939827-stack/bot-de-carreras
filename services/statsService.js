const { HISTORY_RETENTION_DAYS, buildUsageStats, getTrackHistoryWithinRange } = require('./historyService');

async function getTrackMetaStats(trackName, options = {}) {
  const entries = await getTrackHistoryWithinRange(trackName, {
    days: options.days,
    snapshotLimit: options.snapshotLimit,
  });

  return {
    trackName,
    entries,
    cars: buildUsageStats(entries, 'car'),
    powerups: buildUsageStats(entries, 'powerups'),
    days: Number.isInteger(options.days) && options.days > 0 ? options.days : HISTORY_RETENTION_DAYS,
  };
}

module.exports = {
  getTrackMetaStats,
};
