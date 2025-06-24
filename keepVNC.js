// keepVNC.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = 3000;

let configPath = path.join(__dirname, 'config.json');
let logPath = path.join(__dirname, 'log.txt');

let state = {
  running: false,
  interval: null
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Load config nếu có
let config = { url: '', cookies: '' };
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath));
}

function log(message) {
  const timestamp = new Date().toLocaleString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logPath, line);
  console.log(line.trim());
}

function sendRequest() {
  if (!config.url || !config.cookies) return;

  try {
    const cookiesObj = JSON.parse(config.cookies);
    const cookieStr = Object.entries(cookiesObj).map(([k, v]) => `${k}=${v}`).join('; ');
    axios.get(config.url, {
      headers: {
        Cookie: cookieStr
      }
    })
    .then(res => {
      log(`✅ Request thành công - status: ${res.status}`);
    })
    .catch(err => {
      log(`❌ Lỗi khi request: ${err.message}`);
    });
  } catch (e) {
    log(`❌ Lỗi xử lý cookies: ${e.message}`);
  }
}

app.get('/config', (req, res) => {
  res.json(config);
});

app.post('/start', (req, res) => {
  const { url, cookies } = req.body;
  config = { url, cookies };
  fs.writeFileSync(configPath, JSON.stringify(config));

  if (state.running && state.interval) clearInterval(state.interval);

  state.running = true;
  state.interval = setInterval(sendRequest, 5000);
  log(`🚀 Bắt đầu giả truy cập: ${url}`);
  res.json({ success: true });
});

app.post('/stop', (req, res) => {
  if (state.running && state.interval) clearInterval(state.interval);
  state.running = false;
  log(`🛑 Đã dừng gửi request.`);
  res.json({ success: true });
});

app.get('/log', (req, res) => {
  if (!fs.existsSync(logPath)) return res.send('');
  res.send(fs.readFileSync(logPath, 'utf8'));
});

app.listen(PORT, () => {
  console.log(`📡 Server đang chạy tại http://localhost:${PORT}`);
});
