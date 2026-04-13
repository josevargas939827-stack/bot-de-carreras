const axios = require('axios');
const cheerio = require('cheerio');
const tracks = require('../data/tracks');
const { convertTimeToSeconds } = require('../utils/timeUtils');

const BASE_URL = 'https://racing.myupland.info/event_race_times.php?event_id=4';

function pickRaceTimeTable($) {
  const tables = $('table.race-table');
  if (!tables || tables.length === 0) return null;

  let byHeading = null;
  let byHeader = null;

  tables.each((idx, table) => {
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
  return str.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (m) => m.toUpperCase());
}

function mapPowerup(raw) {
  if (!raw) return 'Unknown Power-up';
  const lower = raw.toLowerCase();
  const match = POWERUP_KEYWORDS.find((p) => lower.includes(p.key));
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

        const powerupsCell = $(row).find('.pu-col').first();
        const powerups = extractPowerups(powerupsCell);

        const timeRaw = extractTimeFromRow($, row);

        if (!position || !name || !timeRaw) return;

        const timeSeconds = convertTimeToSeconds(timeRaw);
        if (timeSeconds == null) return;

        results.push({ position, name, car, powerups, time: timeRaw, timeSeconds });
      });
  } catch (err) {
    console.error(`Error scraping track ${trackId} order ${order}:`, err.message);
  }

  return results;
}

async function getActiveTrackAndLeaderboard() {
  for (const track of tracks) {
    const leaderboard = await getLeaderboard(track.trackId, track.order);
    if (leaderboard && leaderboard.length > 0) {
      return { track, leaderboard: leaderboard.slice(0, 18) };
    }
  }
  return { track: null, leaderboard: [] };
}

module.exports = {
  getLeaderboard,
  getActiveTrackAndLeaderboard,
};
