const api = require('../../lib/reportApi.js');

exports.handler = async () => {
  const r = await api.getMeta();
  return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.body) };
};
