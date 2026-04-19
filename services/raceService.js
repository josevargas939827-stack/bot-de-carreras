const axios = require('axios');
const cheerio = require('cheerio');
const tracks = require('../data/tracks');
const { buildEntrySignature, buildLeaderboardSignature, getLatestTrackSnapshot } = require('./historyService');
const { convertTimeToSeconds } = require('../utils/timeUtils');

const BASE_URL = 'https://racing.myupland.info/event_race_times.php?event_id=4';
const MAX_DRIVERS = 18;

const POWERUP_KEYWORDS = [
  { key: 'nitro', label: 'Nitro Boost' },
  { key: 'grip', label: 'Grip Boost' },
  { key: 'turbo', label: 'Turbo Boost' },
];

function titleCase(str) {
  return str.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (match) => match.toUpperCase());
}

function mapPowerup(raw) {
  if (!raw) return 'Unknown Power-up';
  const lower = raw.toLowerCase();
  const match = POWERUP_KEYWORDS.find((powerup) => lower.includes(powerup.key));
  if (match) return match.label;
  return titleCase(raw);
}

function extractPowerups($, $cell) {
  const imgs = $cell.find('img');
  if (!imgs || imgs.length === 0) return [];

  const set = new Set();
  imgs.each((_, img) => {
    const alt = $(img).attr('alt');
    const title = $(img).attr('title');
    const src = $(img).attr('src') || '';
    const srcName = src.split('/').pop().replace(/\.[a-zA-Z0-9]+$/, '');
    const name = alt || title || srcName;
    const mapped = mapPowerup(name);
    if (mapped) set.add(mapped);
  });

  return Array.from(set);
}

function extractTimeFromRow($, row) {
  const timeCell = $(row).find('.time-col').first();
  if (!timeCell || timeCell.length === 0) {
    return null;
  }

  const candidateText = timeCell.text().trim().replace(/\s+/g, ' ');
  const colonMatch = candidateText.match(/(\d{1,2}:\d{2}\.\d{3,})/);
  if (colonMatch) {
    return colonMatch[1];
  }

  const secondsMatch = candidateText.match(/(\d+(?:\.\d+)?)/);
  return secondsMatch ? secondsMatch[1] : null;
}

function extractFinishedAt($, row) {
  const finishedAtCell = $(row).find('.time-col').eq(1);
  if (!finishedAtCell || finishedAtCell.length === 0) {
    return null;
  }

  const value = finishedAtCell.text().trim().replace(/\s+/g, ' ');
  const parsed = Date.parse(`${value} UTC`);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const fallback = Date.parse(value);
  return Number.isFinite(fallback) ? fallback : null;
}

function parseLeaderboardTable($, table) {
  const results = [];
  let latestFinishedAt = 0;

  $(table)
    .find('tr')
    .each((_, row) => {
      const positionText = $(row).find('.pos-col').first().text().trim();
      const position = parseInt(positionText, 10);
      const name = $(row).find('.driver-name strong').first().text().trim();
      const car = $(row).find('.driver-name small').first().text().trim() || 'Unknown Car';
      const powerups = extractPowerups($, $(row).find('.pu-col').first());
      const timeRaw = extractTimeFromRow($, row);

      if (!position || !name || !timeRaw) {
        return;
      }

      const timeSeconds = convertTimeToSeconds(timeRaw);
      if (timeSeconds == null) {
        return;
      }

      const finishedAt = extractFinishedAt($, row);
      if (finishedAt && finishedAt > latestFinishedAt) {
        latestFinishedAt = finishedAt;
      }

      results.push({ position, name, car, powerups, time: timeRaw, timeSeconds, finishedAt });
    });

  return {
    results: results.sort((a, b) => a.position - b.position).slice(0, MAX_DRIVERS),
    latestFinishedAt,
  };
}

function pickBestRaceTable($) {
  const tables = $('table.race-table');
  if (!tables || tables.length === 0) {
    return { results: [], latestFinishedAt: 0 };
  }

  const parsedTables = [];
  tables.each((_, table) => {
    const parsed = parseLeaderboardTable($, table);
    if (parsed.results.length > 0) {
      parsedTables.push(parsed);
    }
  });

  if (parsedTables.length === 0) {
    return { results: [], latestFinishedAt: 0 };
  }

  parsedTables.sort((a, b) => {
    if (b.latestFinishedAt !== a.latestFinishedAt) {
      return b.latestFinishedAt - a.latestFinishedAt;
    }

    if (b.results.length !== a.results.length) {
      return b.results.length - a.results.length;
    }

    return 0;
  });

  return parsedTables[0];
}

async function getLeaderboard(trackId, order) {
  const url = `${BASE_URL}&event_order=${order}&trackid=${trackId}`;

  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(data);
    const parsed = pickBestRaceTable($);
    const leaderboard = parsed.results;
    leaderboard.latestFinishedAt = parsed.latestFinishedAt;
    return leaderboard;
  } catch (error) {
    console.error(`Error scraping track ${trackId} order ${order}:`, error.message);
    return [];
  }
}

function buildRaceProgress(driverCount) {
  return `\u{1F3C1} Race in progress (${driverCount}/${MAX_DRIVERS} drivers)`;
}

async function enrichTrackSnapshot(track, leaderboard) {
  const latestSnapshot = await getLatestTrackSnapshot(track.name);
  const leaderboardSignature = buildLeaderboardSignature(track.name, leaderboard);
  const latestSignature = latestSnapshot ? buildEntrySignature(latestSnapshot) : null;
  const lastSavedTimestamp = latestSnapshot ? Date.parse(latestSnapshot.timestamp) : 0;
  const latestFinishedAt = Number.isFinite(leaderboard.latestFinishedAt) ? leaderboard.latestFinishedAt : 0;

  return {
    track,
    leaderboard,
    driverCount: leaderboard.length,
    isActive: leaderboard.length > 0,
    progressText: buildRaceProgress(leaderboard.length),
    latestSnapshot,
    hasChanged: leaderboardSignature !== latestSignature,
    lastSavedTimestamp,
    latestFinishedAt,
  };
}

function compareTrackSnapshots(a, b) {
  if (b.latestFinishedAt !== a.latestFinishedAt) {
    return b.latestFinishedAt - a.latestFinishedAt;
  }

  if (a.hasChanged !== b.hasChanged) {
    return Number(b.hasChanged) - Number(a.hasChanged);
  }

  if (b.lastSavedTimestamp !== a.lastSavedTimestamp) {
    return b.lastSavedTimestamp - a.lastSavedTimestamp;
  }

  if (b.driverCount !== a.driverCount) {
    return b.driverCount - a.driverCount;
  }

  if (a.track.order !== b.track.order) {
    return a.track.order - b.track.order;
  }

  return a.track.name.localeCompare(b.track.name);
}

async function getAllTrackSnapshots() {
  const trackResults = await Promise.all(
    tracks.map(async (track) => {
      const leaderboard = await getLeaderboard(track.trackId, track.order);
      return enrichTrackSnapshot(track, leaderboard);
    })
  );

  return trackResults.sort(compareTrackSnapshots);
}

async function detectActiveTrack() {
  const snapshots = await getAllTrackSnapshots();
  const activeTrack = snapshots.find((snapshot) => snapshot.isActive) || null;

  return {
    activeTrack,
    snapshots,
  };
}

async function getActiveTrackAndLeaderboard() {
  const { activeTrack } = await detectActiveTrack();

  if (!activeTrack) {
    return {
      track: null,
      leaderboard: [],
      progressText: null,
      driverCount: 0,
    };
  }

  return {
    track: activeTrack.track,
    leaderboard: activeTrack.leaderboard,
    progressText: activeTrack.progressText,
    driverCount: activeTrack.driverCount,
  };
}

module.exports = {
  MAX_DRIVERS,
  detectActiveTrack,
  getActiveTrackAndLeaderboard,
  getAllTrackSnapshots,
  getLeaderboard,
};
