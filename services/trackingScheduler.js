const { detectActiveTrack } = require('./raceService');
const { saveLeaderboardHistory } = require('./historyService');
const { getTrackMetaStats } = require('./statsService');

const TRACKING_INTERVAL_MS = 300000;

let intervalHandle = null;
let isRunning = false;
let lastRunState = {
  startedAt: null,
  finishedAt: null,
  status: 'idle',
  track: null,
  driverCount: 0,
  progressText: null,
  saved: false,
  saveReason: null,
  hasChanged: false,
  errorMessage: null,
  statsSummary: null,
};

async function runTrackingCycle() {
  if (isRunning) {
    console.log('[tracker] Skipping cycle because a previous run is still in progress.');
    return null;
  }

  isRunning = true;
  lastRunState = {
    ...lastRunState,
    startedAt: new Date().toISOString(),
    status: 'running',
    errorMessage: null,
  };

  try {
    const { activeTrack } = await detectActiveTrack();
    if (!activeTrack) {
      console.log('[tracker] No active track detected.');
      lastRunState = {
        ...lastRunState,
        finishedAt: new Date().toISOString(),
        status: 'no_active_track',
        track: null,
        driverCount: 0,
        progressText: null,
        saved: false,
        saveReason: 'no_active_track',
        hasChanged: false,
        statsSummary: null,
      };
      return { track: null, saved: false, reason: 'no_active_track' };
    }

    const saveResult = await saveLeaderboardHistory(activeTrack.track, activeTrack.leaderboard);
    const stats = await getTrackMetaStats(activeTrack.track.name);

    if (saveResult.saved) {
      console.log(`[tracker] Saved snapshot for ${activeTrack.track.name} (${activeTrack.driverCount} drivers).`);
    } else if (saveResult.reason !== 'duplicate') {
      console.log(`[tracker] Snapshot for ${activeTrack.track.name} was not saved: ${saveResult.reason}.`);
    }

    const result = {
      track: activeTrack.track,
      driverCount: activeTrack.driverCount,
      progressText: activeTrack.progressText,
      saved: saveResult.saved,
      saveReason: saveResult.reason || null,
      hasChanged: activeTrack.hasChanged,
      stats,
    };

    lastRunState = {
      ...lastRunState,
      finishedAt: new Date().toISOString(),
      status: 'ok',
      track: activeTrack.track,
      driverCount: activeTrack.driverCount,
      progressText: activeTrack.progressText,
      saved: saveResult.saved,
      saveReason: saveResult.reason || null,
      hasChanged: activeTrack.hasChanged,
      statsSummary: {
        snapshots: stats.entries.length,
        topCar: stats.cars[0] || null,
        topPowerup: stats.powerups[0] || null,
      },
    };

    return result;
  } catch (error) {
    console.error('[tracker] Automatic tracking failed:', error.message);
    lastRunState = {
      ...lastRunState,
      finishedAt: new Date().toISOString(),
      status: 'error',
      track: null,
      driverCount: 0,
      progressText: null,
      saved: false,
      saveReason: 'error',
      hasChanged: false,
      errorMessage: error.message,
      statsSummary: null,
    };
    return { track: null, saved: false, reason: 'error', error };
  } finally {
    isRunning = false;
  }
}

function startTrackingScheduler() {
  if (intervalHandle) {
    return intervalHandle;
  }

  runTrackingCycle().catch((error) => {
    console.error('[tracker] Initial run failed:', error.message);
  });

  intervalHandle = setInterval(() => {
    runTrackingCycle().catch((error) => {
      console.error('[tracker] Scheduled run failed:', error.message);
    });
  }, TRACKING_INTERVAL_MS);

  console.log(`[tracker] Automatic tracking started (${TRACKING_INTERVAL_MS} ms).`);
  return intervalHandle;
}

module.exports = {
  TRACKING_INTERVAL_MS,
  getTrackingStatus: () => ({ ...lastRunState, isRunning, intervalActive: Boolean(intervalHandle) }),
  runTrackingCycle,
  startTrackingScheduler,
};
