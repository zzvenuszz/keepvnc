// keepVNC.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;

let configPath = 'config.json';
let logPath = 'log.txt';
let state = { running: false, interval: null };
let config = { url: '' };

if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath));
}

function log(msg) {
  const t = new Date().toLocaleString();
  const line = `[${t}] ${msg}\n`;
  fs.appendFileSync(logPath, line);
  console.log(line.trim());
}

async function getToken() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  return res.token;
}

async function sendRequest() {
  if (!config.url) return;
  try {
    const token = await getToken();
    log(`> Lấy token: ${token.slice(0,20)}...`);

    const res = await axios.get(config.url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    log(`✅ Response status: ${res.status}`);
  } catch (err) {
    if (err.response) {
      log(`❌ HTTP ${err.response.status}: ${err.response.data}`);
    } else {
      log(`❌ Error: ${err.message}`);
    }
  }
}

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const btn = state.running ? 'Dừng' : 'Bắt đầu';
  res.send(`
    <html><body style="font-family: Arial, sans-serif">
      <h3>KeepVNC – Dùng Access Token để truy cập Workstations</h3>
      <form method="POST" action="/toggle">
        URL VNC:<br/>
        <input name="url" style="width:500px" value="${config.url}"/><br/><br/>
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
    state.interval = setInterval(sendRequest, 5000);
    state.running = true;
    log('🚀 Bắt đầu gửi request token.');
  }
  res.redirect('/');
});

app.get('/log', (req, res) => {
  res.send(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '');
});

app.listen(PORT, () => log(`Server chạy tại http://localhost:${PORT}`));
