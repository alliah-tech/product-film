'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { wavBuffer } = require('./helpers/wav');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.wav': 'audio/wav', '.md': 'text/plain' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/tests/fixtures/track.wav') {
    res.writeHead(200, { 'Content-Type': 'audio/wav' });
    res.end(wavBuffer(1, 330));
    return;
  }
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}).listen(4173, () => console.log('serve on :4173'));
