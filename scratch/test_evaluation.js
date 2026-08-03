const fs = require('fs');
const path = require('path');

// Load env
try {
  fs.readFileSync('.env','utf8').split(/\r?\n/).forEach(l=>{
    const m=l.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
  });
} catch(e){}

const gemini = require('../lib/geminiReport.js');

async function testAnswerPdf() {
  const pdfPath = 'C:\\Users\\balac\\Downloads\\answer.pdf';
  console.log('Loading PDF from:', pdfPath);
  const buffer = fs.readFileSync(pdfPath);
  const base64Data = buffer.toString('base64');
  console.log('Base64 size:', Math.round(base64Data.length / 1024), 'KB');

  const inputs = {
    answerPaper: {
      mimeType: 'application/pdf',
      data: base64Data,
      name: 'answer.pdf'
    }
  };

  console.log('Sending request to Gemini API...');
  const startTime = Date.now();
  try {
    const result = await gemini.generateReport(inputs);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== SUCCESS (in ${duration}s) ===`);
    console.log('Model used:', result.model);
    console.log('Generated Report JSON:\n', JSON.stringify(result.report, null, 2));
  } catch (err) {
    console.error('=== ERROR ===', err);
  }
}

testAnswerPdf();
