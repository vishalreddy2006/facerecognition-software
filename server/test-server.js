// Minimal test server
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ status: 'ok', message: 'Test server works!' }));
});

server.listen(3000, () => {
  console.log('✅ Test server running on http://localhost:3000');
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
});
