const fs = require('fs');
const axios = require('axios');

// Parchea axios antes de cargar el servicio
axios.get = async () => ({ data: fs.readFileSync('sample.html', 'utf8') });

const { getLeaderboard } = require('./services/raceService');

(async () => {
  const data = await getLeaderboard(0, 0);
  console.log(JSON.stringify(data, null, 2));
})();
