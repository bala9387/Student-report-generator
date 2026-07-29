const api = require('../../lib/reportApi.js');

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const r = await api.getLookup(q.mode, q.roll, q.grade);
  return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.body) };
};
