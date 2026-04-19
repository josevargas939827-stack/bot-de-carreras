const fs = require('fs/promises');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'history.json');
const HISTORY_RETENTION_DAYS = 7;
const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function getCutoffTimestamp(now = Date.now()) {
  return now - HISTORY_RETENTION_MS;
}

function normalizePlayer(player = {}) {
  const powerups = Array.isArray(player.powerups)
    ? Array.from(new Set(player.powerups.filter(Boolean).map((item) => String(item).trim()))).sort()
    : [];

  return {
    name: String(player.name || 'Unknown Player').trim(),
    car: String(player.car || 'Unknown Car').trim(),
    powerups,
    time: String(player.time || 'Unknown time').trim(),
  };
}

function collectUniqueValues(players, field) {
  const values = new Set();

  for (const player of players) {
    if (field === 'powerups') {
      const powerups = Array.isArray(player.powerups) ? player.powerups : [];
      for (const powerup of powerups) {
        if (powerup) values.add(String(powerup).trim());
      }
      continue;
    }

    const value = player[field];
    if (value) values.add(String(value).trim());
  }

  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function normalizeEntry(entry = {}) {
  const timestamp = new Date(entry.timestamp || Date.now()).toISOString();
  const players = Array.isArray(entry.players) ? entry.players.map(normalizePlayer) : [];

  return {
    track: String(entry.track || 'Unknown Track').trim(),
    timestamp,
    players,
    cars: Array.isArray(entry.cars) && entry.cars.length > 0
      ? entry.cars.map((item) => String(item).trim())
      : collectUniqueValues(players, 'car'),
    powerups: Array.isArray(entry.powerups) && entry.powerups.length > 0
      ? entry.powerups.map((item) => String(item).trim())
      : collectUniqueValues(players, 'powerups'),
  };
}

function pruneHistoryEntries(entries, now = Date.now()) {
  const cutoff = getCutoffTimestamp(now);

  return entries
    .map(normalizeEntry)
    .filter((entry) => {
      const parsedTimestamp = Date.parse(entry.timestamp);
      return Number.isFinite(parsedTimestamp) && parsedTimestamp >= cutoff && entry.track && entry.players.length > 0;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function buildEntrySignature(entry) {
  return JSON.stringify({
    track: entry.track.toLowerCase(),
    players: entry.players.map((player) => ({
      name: player.name.toLowerCase(),
      car: player.car.toLowerCase(),
      powerups: player.powerups.map((item) => item.toLowerCase()),
      time: player.time,
    })),
  });
}

function buildLeaderboardSignature(trackName, leaderboard) {
  return buildEntrySignature(normalizeEntry({
    track: trackName,
    players: leaderboard,
  }));
}

function dedupeHistoryEntries(entries) {
  const seen = new Set();
  const deduped = [];

  for (const entry of entries) {
    const signature = buildEntrySignature(entry);
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    deduped.push(entry);
  }

  return deduped;
}

async function ensureHistoryFile() {
  const directory = path.dirname(HISTORY_FILE);
  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, '[]', 'utf8');
  }
}

async function writeHistory(entries) {
  await ensureHistoryFile();
  await fs.writeFile(HISTORY_FILE, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

async function readHistory() {
  try {
    await ensureHistoryFile();
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      throw new Error('History JSON root must be an array.');
    }

    const sanitized = dedupeHistoryEntries(pruneHistoryEntries(parsed));
    if (sanitized.length !== parsed.length) {
      await writeHistory(sanitized);
    }

    return sanitized;
  } catch (error) {
    console.error('Failed to read history.json:', error.message);
    return [];
  }
}

async function saveLeaderboardHistory(track, leaderboard) {
  if (!track || !track.name || !Array.isArray(leaderboard) || leaderboard.length === 0) {
    return { saved: false, reason: 'invalid_payload' };
  }

  try {
    const history = await readHistory();
    const newEntry = normalizeEntry({
      track: track.name,
      timestamp: new Date().toISOString(),
      players: leaderboard.map((player) => ({
        name: player.name,
        car: player.car,
        powerups: player.powerups,
        time: player.time,
      })),
    });

    const signature = buildEntrySignature(newEntry);
    const duplicate = history.some((entry) => buildEntrySignature(entry) === signature);
    if (duplicate) {
      return { saved: false, reason: 'duplicate' };
    }

    const nextHistory = dedupeHistoryEntries(pruneHistoryEntries([newEntry, ...history]));
    await writeHistory(nextHistory);
    return { saved: true, entry: newEntry };
  } catch (error) {
    console.error('Failed to save leaderboard history:', error.message);
    return { saved: false, reason: 'error', error };
  }
}

async function getTrackHistory(trackName, limit = 3) {
  const history = await readHistory();
  const normalizedTrack = String(trackName || '').trim().toLowerCase();

  return history
    .filter((entry) => entry.track.toLowerCase() === normalizedTrack)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit);
}

async function getLatestTrackSnapshot(trackName) {
  const [latestEntry] = await getTrackHistory(trackName, 1);
  return latestEntry || null;
}

async function getTrackHistoryWithinRange(trackName, options = {}) {
  const history = await readHistory();
  const normalizedTrack = String(trackName || '').trim().toLowerCase();
  const days = Number.isInteger(options.days) && options.days > 0
    ? Math.min(options.days, HISTORY_RETENTION_DAYS)
    : HISTORY_RETENTION_DAYS;
  const snapshotLimit = Number.isInteger(options.snapshotLimit) && options.snapshotLimit > 0
    ? options.snapshotLimit
    : null;
  const cutoffTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000);

  const filtered = history.filter((entry) => (
    entry.track.toLowerCase() === normalizedTrack && Date.parse(entry.timestamp) >= cutoffTimestamp
  ));

  return snapshotLimit ? filtered.slice(0, snapshotLimit) : filtered;
}

function buildUsageStats(entries, field) {
  const counts = new Map();
  let total = 0;

  for (const entry of entries) {
    for (const player of entry.players) {
      const values = field === 'powerups'
        ? (Array.isArray(player.powerups) && player.powerups.length > 0 ? player.powerups : ['No Power-ups'])
        : [player[field] || 'Unknown'];

      for (const value of values) {
        const label = String(value || 'Unknown').trim();
        counts.set(label, (counts.get(label) || 0) + 1);
        total += 1;
      }
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage: total === 0 ? 0 : (count / total) * 100,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
}

module.exports = {
  HISTORY_FILE,
  HISTORY_RETENTION_DAYS,
  buildEntrySignature,
  buildLeaderboardSignature,
  buildUsageStats,
  getLatestTrackSnapshot,
  getTrackHistory,
  getTrackHistoryWithinRange,
  readHistory,
  saveLeaderboardHistory,
};
