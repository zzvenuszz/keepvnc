const net = require('net');
const express = require('express');
const rfb = require('rfb2');
const app = express();

let HOST = '0.tcp.jp.ngrok.io';
let PORT = 11151;
let PASSWORD = '';

let lastPing = 'Chưa ping';
let visitCount = 0;
let lastVisitTime = 'Chưa có truy cập';
let vncClient = null;
let keepAliveInterval = null;

const INTERVAL = 30000;

app.use(express.urlencoded({ extended: true }));

function now() {
  return new Date().toLocaleString('vi-VN', { hour12: false });
}

function keepAlivePing() {
  const socket = new net.Socket();
  socket.setTimeout(10000);

  socket.connect(PORT, HOST, () => {
    lastPing = now();
    console.log(`[${lastPing}] ✅ Ping VNC thành công: ${HOST}:${PORT}`);
    socket.destroy();
  });

  socket.on('error', (err) => {
    console.error(`[${now()}] ❌ Lỗi kết nối TCP: ${err.message}`);
  });

  socket.on('timeout', () => {
    console.warn(`[${now()}] ⏰ Timeout TCP`);
    socket.destroy();
  });
}

function connectVNCClient() {
  if (vncClient) {
    try {
      vncClient.end();
      vncClient = null;
      clearInterval(keepAliveInterval);
    } catch (e) {}
  }

  console.log(`[${now()}] 🕹️ Đang kết nối VNC: ${HOST}:${PORT}`);

  vncClient = rfb.createConnection({
    host: HOST,
    port: PORT,
    password: PASSWORD,
    shared: true
  });

  vncClient.on('connect', () => {
    console.log(`[${now()}] ✅ Fake client VNC đã kết nối`);

    const KEEP_ALIVE_KEYS = [0xFFE5, 0xFFE1, 0xFF09, 0xFF1B, 0x20]; // CapsLock, Shift, Tab, Esc, Space
    let keyIndex = 0;

    keepAliveInterval = setInterval(() => {
      const key = KEEP_ALIVE_KEYS[keyIndex % KEEP_ALIVE_KEYS.length];
      keyIndex++;

      try {
        vncClient.keyEvent(key, 1); // nhấn
        vncClient.keyEvent(key, 0); // thả
        console.log(`[${now()}] ⌨️ Gửi giữ kết nối với phím mã: 0x${key.toString(16).toUpperCase()}`);
      } catch (e) {
        console.log(`[${now()}] ⚠️ Lỗi gửi phím giữ kết nối: ${e.message}`);
      }
    }, 10000);
  });

  vncClient.on('error', (err) => {
    console.error(`[${now()}] ❌ VNC lỗi: ${err.message}`);
  });

  vncClient.on('close', () => {
    console.warn(`[${now()}] 🔌 VNC đóng kết nối`);
    clearInterval(keepAliveInterval);
    setTimeout(connectVNCClient, 5000);
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
        body { font-family: Arial; background: #f5f5f5; padding: 20px; max-width: 600px; margin: auto; }
        h1 { color: #2b9348; }
        input, button { width: 100%; padding: 10px; margin: 5px 0; }
        button { background: #2b9348; color: white; border: none; cursor: pointer; }
        button:hover { background: #238636; }
      </style>
    </head>
    <body>
      <h1>✅ VNC is alive!</h1>
      <p>🔗 <strong>Địa chỉ đang kết nối:</strong> ${HOST}:${PORT}</p>
      <p>📡 <strong>Ping gần nhất:</strong> ${lastPing}</p>
      <p>🔁 <strong>Số lượt truy cập:</strong> ${visitCount}</p>
      <p>🕒 <strong>Truy cập gần nhất:</strong> ${lastVisitTime}</p>
      <hr>
      <h3>🔧 Cập nhật địa chỉ VNC</h3>
      <form method="POST" action="/update">
        <input type="text" name="vnc_address" value="${HOST}:${PORT}" required placeholder="ip:port">
        <input type="text" name="vnc_password" value="${PASSWORD}" placeholder="Mật khẩu (nếu có)">
        <button type="submit">Cập nhật</button>
      </form>
    </body>
    </html>
  `);
});

app.post('/update', (req, res) => {
  const { vnc_address, vnc_password } = req.body;

  if (!vnc_address.includes(':')) {
    return res.send('❌ Địa chỉ không hợp lệ. Định dạng: ip:port');
  }

  const [host, port] = vnc_address.split(':');
  if (!host || isNaN(Number(port))) {
    return res.send('❌ Địa chỉ hoặc cổng không hợp lệ.');
  }

  HOST = host.trim();
  PORT = Number(port.trim());
  PASSWORD = vnc_password?.trim() || '';
  console.log(`[${now()}] 🔄 Đã cập nhật VNC: ${HOST}:${PORT}`);

  connectVNCClient();
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
  console.log(`🌐 Web UI chạy tại http://localhost:${WEB_PORT}`);
});

// Khởi động
connectVNCClient();
keepAlivePing();
setInterval(keepAlivePing, INTERVAL);
