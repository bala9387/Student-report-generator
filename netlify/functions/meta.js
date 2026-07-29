const api = require('../../lib/reportApi.js');

exports.handler = async (event) => {
  const q = (event && event.queryStringParameters) || {};
  const r = await api.getMeta(q.grade);
  return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.body) };
};
