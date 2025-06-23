const net = require('net');
const express = require('express');
const basicAuth = require('express-basic-auth');
const app = express();

let HOST = '0.tcp.jp.ngrok.io';
let PORT = 11151;
const INTERVAL = 30000;

let lastPing = 'Chưa ping';
let visitCount = 0;
let lastVisitTime = 'Chưa có truy cập';

// Bảo vệ bằng mật khẩu cơ bản
app.use(basicAuth({
  users: { 'admin': 'HuyHoan76' },
  challenge: true,
  unauthorizedResponse: (req) => '🔒 Truy cập bị từ chối: Bạn cần đăng nhập!'
}));

app.use(express.urlencoded({ extended: true }));

// Ghi log vào bộ nhớ
const logs = [];
function now() {
  return new Date().toLocaleString('vi-VN', { hour12: false });
}
function logToMemory(line) {
  const entry = `[${now()}] ${line}`;
  console.log(entry);
  logs.push(entry);
  if (logs.length > 200) logs.shift();
}

function keepAlive() {
  const socket = new net.Socket();
  socket.setTimeout(10000);

  socket.connect(PORT, HOST, () => {
    lastPing = now();
    logToMemory(`✅ Ping VNC thành công: ${HOST}:${PORT}`);
    socket.destroy();
  });

  socket.on('error', (err) => {
    logToMemory(`❌ Lỗi kết nối: ${err.message}`);
  });

  socket.on('timeout', () => {
    logToMemory(`⏰ Timeout`);
    socket.destroy();
  });
}

app.get('/', (req, res) => {
  visitCount++;
  lastVisitTime = now();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  logToMemory(`📥 Truy cập #${visitCount} từ IP ${ip}`);

  res.send(`
    <html>
    <head>
      <title>VNC Keep Alive</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f5f5f5;
          color: #333;
          max-width: 700px;
          margin: 30px auto;
          padding: 20px;
          border-radius: 12px;
          background-color: #fff;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h1 { color: #2b9348; }
        strong { color: #0077b6; }
        label { font-weight: bold; }
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
        button:hover { background-color: #238636; }
        hr { margin: 20px 0; }
        pre {
          background: #eee;
          padding: 10px;
          border-radius: 8px;
          height: 300px;
          overflow: auto;
        }
      </style>
    
    <script>
      function updateLogs() {
        fetch('/logs')
          .then(res => res.text())
          .then(data => {
            document.getElementById('log-box').innerText = data;
          });
      }
      setInterval(updateLogs, 5000); // cập nhật mỗi 5 giây
      window.onload = updateLogs;
    </script>
    
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
      <hr>
      <h3>📜 Log máy chủ</h3>
      <pre id='log-box'>Đang tải log...</pre>
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
  logToMemory(`🔄 Đã cập nhật VNC: ${HOST}:${PORT}`);
  res.redirect('/');
});

app.get('/ping', (req, res) => {
  const time = now();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  logToMemory(`📶 Ping nhận từ ${ip}`);
  res.send(`OK: ${lastPing}`);
});

const WEB_PORT = process.env.PORT || 3000;
app.listen(WEB_PORT, () => {
  logToMemory(`🌐 Web UI running at http://localhost:${WEB_PORT}`);
});

keepAlive();
setInterval(keepAlive, INTERVAL);


// Endpoint để trả log dưới dạng text
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(logs.slice().reverse().join('\n'));
});
