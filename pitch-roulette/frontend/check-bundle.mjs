const path = '/assets/index-_0ypEZZp.js';
const t = await (await fetch('https://pitch-roulette.vercel.app' + path)).text();
const m = t.match(/https:\/\/[a-z0-9.-]+\.railway\.app/);
console.log('API base:', m?.[0]);
if (m) {
  console.log('standings:', m[0] + '/api/standings/WC');
  console.log('matches:', m[0] + '/api/matches/WC');
}
