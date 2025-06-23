const net = require('net');
const express = require('express');
const app = express();

// Cấu hình địa chỉ VNC và thời gian ping
const HOST = '0.tcp.jp.ngrok.io';
const PORT = 11151;
const INTERVAL = 30000; // 30 giây

// Biến lưu trạng thái
let lastPing = 'Chưa ping';
let visitCount = 0;
let lastVisitTime = 'Chưa có truy cập';

// Hàm giữ kết nối VNC sống
function keepAlive() {
  const socket = new net.Socket();
  socket.setTimeout(10000); // 10 giây timeout

  socket.connect(PORT, HOST, () => {
    lastPing = new Date().toISOString();
    console.log(`[${lastPing}] ✅ Ping VNC thành công: ${HOST}:${PORT}`);
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

// Giao diện web chính
app.get('/', (req, res) => {
  visitCount++;
  lastVisitTime = new Date().toISOString();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // Ghi log ra console
  console.log(`📥 Truy cập #${visitCount} lúc ${lastVisitTime} từ IP: ${ip}`);

  res.send(`
    <h1>✅ VNC is alive!</h1>
    <p>Last ping: ${lastPing}</p>
    <p>🔁 Số lượt truy cập: ${visitCount}</p>
    <p>🕒 Truy cập gần nhất: ${lastVisitTime}</p>
  `);
});

// API cho UptimeRobot ping
app.get('/ping', (req, res) => {
  const time = new Date().toISOString();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  console.log(`📶 [${time}] Ping nhận từ ${ip}`);
  res.send(`OK: ${lastPing}`);
});

// Khởi chạy web server
const WEB_PORT = process.env.PORT || 3000;
app.listen(WEB_PORT, () => {
  console.log(`🌐 Web UI running at http://localhost:${WEB_PORT}`);
});

// Bắt đầu quá trình ping định kỳ
keepAlive();
setInterval(keepAlive, INTERVAL);
