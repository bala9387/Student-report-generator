const api = require('../../lib/reportApi.js');

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const fresh = q.fresh === '1' || !!q._t;
  const r = await api.getLeaderboard(q.scope, q.n, q.grade, q.mode || q.exam, fresh);
  return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.body) };
};
