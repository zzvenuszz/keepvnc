const net = require('net');
const express = require('express');
const app = express();

let HOST = '0.tcp.jp.ngrok.io';
let PORT = 11151;
const INTERVAL = 30000;

let lastPing = 'Chưa ping';
let visitCount = 0;
let lastVisitTime = 'Chưa có truy cập';

app.use(express.urlencoded({ extended: true }));

function now() {
  return new Date().toLocaleString('vi-VN', { hour12: false });
}

function keepAlive() {
  const socket = new net.Socket();
  socket.setTimeout(10000);

  socket.connect(PORT, HOST, () => {
    lastPing = now();
    console.log(`[${lastPing}] ✅ Ping VNC thành công: ${HOST}:${PORT}`);
    socket.destroy();
  });

  socket.on('error', (err) => {
    console.error(`[${now()}] ❌ Lỗi kết nối: ${err.message}`);
  });

  socket.on('timeout', () => {
    console.warn(`[${now()}] ⏰ Timeout`);
    socket.destroy();
  });
}

app.get('/', (req, res) => {
  visitCount++;
  lastVisitTime = now();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  console.log(`📥 Truy cập #${visitCount} lúc ${lastVisitTime} từ IP: ${ip}`);

  res.send(`
    <html>
    <head>
      <title>VNC Keep Alive</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f5f5f5;
          color: #333;
          max-width: 600px;
          margin: 30px auto;
          padding: 20px;
          border-radius: 12px;
          background-color: #fff;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #2b9348;
        }
        strong {
          color: #0077b6;
        }
        label {
          font-weight: bold;
        }
        input {
          padding: 5px;
          width: 100%;
          margin-top: 4px;
          margin-bottom: 10px;
          border: 1px solid #ccc;
          border-radius: 6px;
        }
        button {
          padding: 10px 15px;
          background-color: #2b9348;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        button:hover {
          background-color: #238636;
        }
        hr {
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <h1>✅ VNC is alive!</h1>
      <p>🔗 <strong>Địa chỉ đang ping:</strong> ${HOST}:${PORT}</p>
      <p>📡 <strong>Ping gần nhất:</strong> ${lastPing}</p>
      <p>🔁 <strong>Số lượt truy cập:</strong> ${visitCount}</p>
      <p>🕒 <strong>Truy cập gần nhất:</strong> ${lastVisitTime}</p>
      <hr>
      <h3>🔧 Cập nhật địa chỉ VNC</h3>
      <form method="POST" action="/update">
        <label>VNC Address (ip:port)</label>
        <input type="text" name="vnc_address" value="${HOST}:${PORT}" required>
        <button type="submit">Cập nhật</button>
      </form>
    </body>
    </html>
  `);
});

app.post('/update', (req, res) => {
  const { vnc_address } = req.body;

  if (!vnc_address || !vnc_address.includes(':')) {
    return res.send('❌ Dữ liệu không hợp lệ. Định dạng đúng là ip:port');
  }

  const [host, port] = vnc_address.split(':');

  if (!host || !port || isNaN(Number(port))) {
    return res.send('❌ Địa chỉ hoặc cổng không hợp lệ.');
  }

  HOST = host.trim();
  PORT = Number(port.trim());
  console.log(`[${now()}] 🔄 Đã cập nhật VNC host: ${HOST}, port: ${PORT}`);
  res.redirect('/');
});

app.get('/ping', (req, res) => {
  const time = now();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  console.log(`📶 [${time}] Ping nhận từ ${ip}`);
  res.send(`OK: ${lastPing}`);
});

const WEB_PORT = process.env.PORT || 3000;
app.listen(WEB_PORT, () => {
  console.log(`🌐 Web UI running at http://localhost:${WEB_PORT}`);
});

keepAlive();
setInterval(keepAlive, INTERVAL);
