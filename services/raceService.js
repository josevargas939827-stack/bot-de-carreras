const axios = require('axios');
const cheerio = require('cheerio');
const tracks = require('../data/tracks');
const { buildEntrySignature, buildLeaderboardSignature, getLatestTrackSnapshot } = require('./historyService');
const { convertTimeToSeconds } = require('../utils/timeUtils');

const BASE_URL = 'https://racing.myupland.info/event_race_times.php?event_id=4';
const MAX_DRIVERS = 18;

function pickRaceTimeTable($) {
  const tables = $('table.race-table');
  if (!tables || tables.length === 0) return null;

  let byHeading = null;
  let byHeader = null;

  tables.each((_, table) => {
    const heading = $(table).prevAll('h4.table-title').first().text().toLowerCase();
    const hasRows = $(table).find('.pos-col').length > 0;
    if (!hasRows) return;

    if (/race|event/.test(heading)) {
      byHeading = table;
      return false;
    }

    const headerText = $(table).find('th').text().toLowerCase();
    if (/race|event/.test(headerText)) {
      byHeader = table;
    }
  });

  if (byHeading) return byHeading;
  if (byHeader) return byHeader;
  return tables.last();
}

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

function extractPowerups($cell) {
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
  const timeCells = $(row).find('.time-col');
  let timeRaw = null;

  timeCells.each((__, cell) => {
    const candidateText = $(cell).text().trim().replace(/\s+/g, ' ');
    const match = candidateText.match(/(\d{1,2}:\d{2}\.\d{3,})/);
    if (match) {
      timeRaw = match[1];
      return false;
    }
  });

  return timeRaw;
}

async function getLeaderboard(trackId, order) {
  const url = `${BASE_URL}&event_order=${order}&trackid=${trackId}`;
  const results = [];

  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(data);

    const targetTable = pickRaceTimeTable($);
    if (!targetTable) return results;

    $(targetTable)
      .find('tr')
      .each((_, row) => {
        const positionText = $(row).find('.pos-col').first().text().trim();
        const position = parseInt(positionText, 10);
        const name = $(row).find('.driver-name strong').first().text().trim();
        const car = $(row).find('.driver-name small').first().text().trim() || 'Unknown Car';
        const powerups = extractPowerups($(row).find('.pu-col').first());
        const timeRaw = extractTimeFromRow($, row);

        if (!position || !name || !timeRaw) {
          return;
        }

        const timeSeconds = convertTimeToSeconds(timeRaw);
        if (timeSeconds == null) {
          return;
        }

        results.push({ position, name, car, powerups, time: timeRaw, timeSeconds });
      });
  } catch (error) {
    console.error(`Error scraping track ${trackId} order ${order}:`, error.message);
  }

  return results.sort((a, b) => a.position - b.position).slice(0, MAX_DRIVERS);
}

function buildRaceProgress(driverCount) {
  return `🏁 Race in progress (${driverCount}/${MAX_DRIVERS} drivers)`;
}

async function enrichTrackSnapshot(track, leaderboard) {
  const latestSnapshot = await getLatestTrackSnapshot(track.name);
  const leaderboardSignature = buildLeaderboardSignature(track.name, leaderboard);
  const latestSignature = latestSnapshot ? buildEntrySignature(latestSnapshot) : null;
  const lastSavedTimestamp = latestSnapshot ? Date.parse(latestSnapshot.timestamp) : 0;

  return {
    track,
    leaderboard,
    driverCount: leaderboard.length,
    isActive: leaderboard.length > 0,
    progressText: buildRaceProgress(leaderboard.length),
    latestSnapshot,
    hasChanged: leaderboardSignature !== latestSignature,
    lastSavedTimestamp,
  };
}

function compareTrackSnapshots(a, b) {
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
