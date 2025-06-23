const net = require('net');
const express = require('express');
const rfb = require('rfb2');
const auth = require('basic-auth');
const app = express();

// Cấu hình mặc định
let HOST = '0.tcp.jp.ngrok.io';
let PORT = 11151;
let PASSWORD = '';

// Trạng thái hệ thống
let lastPing = 'Chưa ping';
let visitCount = 0;
let lastVisitTime = 'Chưa có truy cập';
let vncClient = null;
let keepAliveInterval = null;
let logLines = [];

const INTERVAL = 30000;
const USERNAME = 'admin';
const PASSWORD_PROTECT = 'HuyHoan76';

app.use(express.urlencoded({ extended: true }));

function now() {
  return new Date().toLocaleString('vi-VN', { hour12: false });
}

function addLog(line) {
  const time = now();
  const log = `[${time}] ${line}`;
  console.log(log);
  logLines.push(log);
  if (logLines.length > 1000) logLines.shift(); // Giới hạn log trong RAM
}

// Middleware bảo vệ
function basicAuth(req, res, next) {
  const user = auth(req);
  if (!user || user.name !== USERNAME || user.pass !== PASSWORD_PROTECT) {
    res.set('WWW-Authenticate', 'Basic realm="VNC Keep Alive"');
    return res.status(401).send('🚫 Truy cập bị từ chối. Bạn cần đăng nhập.');
  }
  next();
}

// Ping kiểm tra VNC
function keepAlivePing() {
  const socket = new net.Socket();
  socket.setTimeout(10000);

  socket.connect(PORT, HOST, () => {
    lastPing = now();
    addLog(`✅ Ping VNC thành công: ${HOST}:${PORT}`);
    socket.destroy();
  });

  socket.on('error', (err) => {
    addLog(`❌ Lỗi kết nối TCP: ${err.message}`);
  });

  socket.on('timeout', () => {
    addLog(`⏰ Timeout TCP`);
    socket.destroy();
  });
}

// Kết nối VNC giữ phiên
function connectVNCClient() {
  if (vncClient) {
    try {
      vncClient.end();
      vncClient = null;
      clearInterval(keepAliveInterval);
    } catch (e) {}
  }

  addLog(`🕹️ Đang kết nối VNC: ${HOST}:${PORT}`);

  vncClient = rfb.createConnection({
    host: HOST,
    port: PORT,
    password: PASSWORD,
    shared: true
  });

  vncClient.on('connect', () => {
    addLog(`✅ Fake client VNC đã kết nối`);
    keepAliveInterval = setInterval(() => {
      try {
        vncClient.pointerEvent(0, 0, 0);
        addLog(`🟢 VNC keep-alive`);
      } catch (e) {
        addLog(`⚠️ Lỗi keep-alive: ${e.message}`);
      }
    }, 10000);
  });

  vncClient.on('error', (err) => {
    addLog(`❌ VNC lỗi: ${err.message}`);
  });

  vncClient.on('close', () => {
    addLog(`🔌 VNC đóng kết nối`);
    clearInterval(keepAliveInterval);
    setTimeout(connectVNCClient, 5000);
  });
}

// Trang chủ (bảo vệ)
app.get('/', basicAuth, (req, res) => {
  visitCount++;
  lastVisitTime = now();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  addLog(`📥 Truy cập #${visitCount} từ IP: ${ip}`);

  res.send(`
    <html>
    <head>
      <title>VNC Keep Alive</title>
      <style>
        body { font-family: Arial; background: #f5f5f5; padding: 20px; max-width: 700px; margin: auto; }
        h1 { color: #2b9348; }
        input, button { width: 100%; padding: 10px; margin: 5px 0; }
        button { background: #2b9348; color: white; border: none; cursor: pointer; }
        button:hover { background: #238636; }
        pre { background: #222; color: #0f0; padding: 10px; height: 300px; overflow-y: scroll; font-size: 13px; }
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
      <hr>
      <h3>📜 Logs gần đây</h3>
      <pre id="logBox">Đang tải logs...</pre>
      <script>
        async function updateLogs() {
          try {
            const res = await fetch('/logs');
            const data = await res.json();
            document.getElementById('logBox').innerText = data.join('\\n');
          } catch (e) {
            document.getElementById('logBox').innerText = 'Không thể tải logs.';
          }
        }
        updateLogs();
        setInterval(updateLogs, 5000);
      </script>
    </body>
    </html>
  `);
});

// Xử lý cập nhật địa chỉ VNC (bảo vệ)
app.post('/update', basicAuth, (req, res) => {
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
  addLog(`🔄 Đã cập nhật VNC: ${HOST}:${PORT}`);
  connectVNCClient();
  res.redirect('/');
});

// API trả logs (bảo vệ)
app.get('/logs', basicAuth, (req, res) => {
  res.json(logLines.slice(-100).reverse());
});

// API ping không cần mật khẩu
app.get('/ping', (req, res) => {
  const time = now();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  addLog(`📶 Ping từ ${ip}`);
  res.send(`OK: ${lastPing}`);
});

// Khởi chạy server
const WEB_PORT = process.env.PORT || 3000;
app.listen(WEB_PORT, () => {
  addLog(`🌐 Web UI chạy tại http://localhost:${WEB_PORT}`);
});

connectVNCClient();
keepAlivePing();
setInterval(keepAlivePing, INTERVAL);
