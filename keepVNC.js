const net = require('net');
const express = require('express');
const app = express();

// Cho phép cập nhật địa chỉ và cổng VNC
let HOST = '0.tcp.jp.ngrok.io';
let PORT = 11151;
const INTERVAL = 30000; // 30 giây

let lastPing = 'Chưa ping';
let visitCount = 0;
let lastVisitTime = 'Chưa có truy cập';

// Middleware để xử lý dữ liệu từ form
app.use(express.urlencoded({ extended: true }));

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

  console.log(`📥 Truy cập #${visitCount} lúc ${lastVisitTime} từ IP: ${ip}`);

  res.send(`
    <h1>✅ VNC is alive!</h1>
    <p>🔗 Địa chỉ đang ping: <strong>${HOST}:${PORT}</strong></p>
    <p>Last ping: ${lastPing}</p>
    <p>🔁 Số lượt truy cập: ${visitCount}</p>
    <p>🕒 Truy cập gần nhất: ${lastVisitTime}</p>
    <hr>
    <h3>🔧 Cập nhật địa chỉ VNC</h3>
    <form method="POST" action="/update">
      <label>Host: <input type="text" name="host" value="${HOST}" required></label><br><br>
      <label>Port: <input type="number" name="port" value="${PORT}" required></label><br><br>
      <button type="submit">Cập nhật</button>
    </form>
  `);
});

// Xử lý cập nhật host và port
app.post('/update', (req, res) => {
  const { host, port } = req.body;

  if (!host || !port || isNaN(Number(port))) {
    return res.send('❌ Dữ liệu không hợp lệ.');
  }

  HOST = host;
  PORT = Number(port);
  console.log(`🔄 Đã cập nhật VNC host: ${HOST}, port: ${PORT}`);
  res.redirect('/');
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
