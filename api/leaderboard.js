const api = require('../lib/reportApi.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query || {};
  const fresh = q.fresh === '1' || !!q._t;
  const r = await api.getLeaderboard(q.scope, q.n, q.grade, q.mode || q.exam, fresh);
  return res.status(r.status).json(r.body);
};
