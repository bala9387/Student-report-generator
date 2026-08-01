const api = require('../lib/reportApi.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query || {};
  const r = await api.getLeaderboard(q.scope, q.n, q.grade);
  return res.status(r.status).json(r.body);
};
