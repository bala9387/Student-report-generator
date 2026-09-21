module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let filename = 'download.pdf';
    let base64 = '';

    if (req.method === 'POST') {
      const body = req.body || {};
      filename = body.filename || filename;
      base64 = body.base64 || body.data || '';
    } else {
      const q = req.query || {};
      filename = q.filename || filename;
      base64 = q.base64 || '';
    }

    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename += '.pdf';
    }
    // Sanitize filename to prevent header injection
    filename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

    if (!base64) {
      return res.status(400).send('No PDF data provided');
    }

    // Strip data URL prefix if present
    if (base64.indexOf(',') >= 0) {
      base64 = base64.split(',')[1];
    }

    const pdfBuffer = Buffer.from(base64, 'base64');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('download-pdf error:', err);
    return res.status(500).send('Download error: ' + (err.message || err));
  }
};
