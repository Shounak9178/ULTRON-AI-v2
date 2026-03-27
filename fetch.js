const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/plan',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const p = JSON.parse(data);
      console.log("EXPLANATION LENGTH:", p.project.explanation ? p.project.explanation.length : "MISSING");
      console.log("EXPLANATION SNIPPET:", p.project.explanation ? p.project.explanation.slice(0, 200) : "N/A");
    } catch(e) { console.log("PARSE ERR:", e.message, data.slice(0, 100)); }
  });
});
req.write(JSON.stringify({query: 'Kalman Filter', software: 'matlab'}));
req.end();
