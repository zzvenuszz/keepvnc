// keepVNC.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

const app = express();
const PORT = 3000;

let configPath = 'config.json';
let logPath = 'log.txt';
let state = { running: false, interval: null };
let config = { url: '', cookies: '' };

// Load config nếu có
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath));
}

// Hàm log
function log(msg) {
  const t = new Date().toLocaleString();
  const line = `[${t}] ${msg}\n`;
  fs.appendFileSync(logPath, line);
  console.log(line.trim());
}

// Lấy Access Token từ Google
async function getToken() {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  return res.token;
}

// Gửi request token hoặc redirect để mở URL VNC
async function sendRequest() {
  if (!config.url) return;
  try {
    const token = await getToken();
    log(`> Lấy token (prefix): ${token.slice(0,20)}...`);
    
    // Cách 1: Gửi request server-side
    const res = await axios.get(config.url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    log(`✅ Status: ${res.status}`);

    // Cách 2: Nếu bạn muốn mở link VNC + token qua browser
    // res.redirect(`${config.url}&_workstationAccessToken=${token}`);

  } catch (err) {
    if (err.response) {
      log(`❌ HTTP ${err.response.status}: ${err.response.data}`);
    } else {
      log(`❌ Lỗi: ${err.message}`);
    }
  }
}

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const btn = state.running ? 'Dừng' : 'Bắt đầu';
  res.send(`
    <html><body style="font-family:Arial,sans-serif">
    <h3>KeepVNC – Dùng Access Token để truy cập Workstations</h3>
    <form method="POST" action="/toggle">
      URL VNC:<br/>
      <input name="url" style="width:500px" value="${config.url}"/><br/><br/>
      <small>Ví dụ: https://.../vnc.html?autoconnect=true&resize=remote</small><br/><br/>
      <button type="submit">${btn}</button>
    </form>
    <pre id="log" style="border:1px solid #ccc; padding:10px; height:300px; overflow:auto"></pre>
    <script>
      function refresh() {
        fetch('/log').then(r=>r.text()).then(t=>{
          document.getElementById('log').textContent = t;
          setTimeout(refresh,5000);
        });
      }
      refresh();
    </script>
    </body></html>
  `);
});

app.post('/toggle', (req, res) => {
  config.url = req.body.url || '';
  fs.writeFileSync(configPath, JSON.stringify(config));

  if (state.running) {
    clearInterval(state.interval);
    state.running = false;
    log('🛑 Dừng gửi request.');
  } else {
    state.interval = setInterval(() => {
      sendRequest();
    }, 5000);
    state.running = true;
    log('🚀 Bắt đầu gửi request token.');
  }
  res.redirect('/');
});

app.get('/log', (req, res) => {
  const t = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  res.send(t);
});

app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
