const net = require('net');
const express = require('express');
const app = express();

const HOST = '0.tcp.jp.ngrok.io';  // NAT đến VNC Ubuntu
const PORT = 11151;                // Cổng NAT
const INTERVAL = 30000;

let lastPing = 'Chưa ping';

function keepAlive() {
  const socket = new net.Socket();
  socket.setTimeout(10000);

  socket.connect(PORT, HOST, () => {
    console.log(`[${new Date().toISOString()}] ✅ Ping VNC thành công: ${HOST}:${PORT}`);
    lastPing = new Date().toISOString();
    socket.destroy();
  });

  socket.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] ❌ Lỗi kết nối: ${err.message}`);
  });

  socket.on('timeout', () => {
    console.warn(`[${new Date().toISOString()}] ⏰ Timeout`);
    socket.destroy();
  });
}

// Web server để UptimeRobot ping
app.get('/', (req, res) => {
  res.send(`<h1>✅ VNC is alive!</h1><p>Last ping: ${lastPing}</p>`);
});
app.get('/ping', (req, res) => {
  res.send(`OK: ${lastPing}`);
});

const WEB_PORT = process.env.PORT || 3000;
app.listen(WEB_PORT, () => {
  console.log(`🌐 Web UI running at http://localhost:${WEB_PORT}`);
});

// Chạy ping
keepAlive();
setInterval(keepAlive, INTERVAL);
