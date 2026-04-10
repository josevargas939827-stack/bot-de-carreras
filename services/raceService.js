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

    // Heading check (race/event)
    if (/race|event/.test(heading)) {
      byHeading = table;
      return false; // prefer heading match
    }

    // Header text check inside table (th)
    const headerText = $(table).find('th').text().toLowerCase();
    if (/race|event/.test(headerText)) {
      byHeader = table;
    }
  });

  if (byHeading) return byHeading;
  if (byHeader) return byHeader;

  // Fallback: assume the last race-table is the race times (site lists qualifying first, race second)
  return tables.last();
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
        const position = $(row).find('.pos-col').first().text().trim();
        const name = $(row).find('.driver-name strong').first().text().trim();

        const timeCells = $(row).find('.time-col');
        let timeRaw = null;
        timeCells.each((__, cell) => {
          const candidate = $(cell).text().trim().replace(/\s+/g, ' ');
          if (/\d{1,2}:\d{2}\.\d+/.test(candidate)) {
            timeRaw = candidate;
            return false;
          }
        });

        if (!position || !name || !timeRaw) return;

        const timeSeconds = convertTimeToSeconds(timeRaw);
        if (timeSeconds == null) return;

        results.push({ position: parseInt(position, 10), name, timeRaw, timeSeconds });
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
