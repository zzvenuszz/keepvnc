// keepVNC.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = 3000;

let configPath = 'config.json';
let logPath = 'log.txt';
let state = { running:false, interval:null };
let config = { url:'', cookies:'' };

// load config nếu có
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath));
}

// lưu log
function log(msg) {
  const t = new Date().toLocaleString();
  const line = `[${t}] ${msg}\n`;
  fs.appendFileSync(logPath, line);
  console.log(line.trim());
}

// gửi request
function sendRequest() {
  if (!config.url || !config.cookies) return;
  try {
    const obj = JSON.parse(config.cookies);
    const s = Object.entries(obj).map(([k,v])=>`${k}=${v}`).join('; ');
    axios.get(config.url, { headers:{ Cookie: s } })
      .then(r => log(`✅ Status: ${r.status}`))
      .catch(e => log(`❌ Error: ${e.message}`));
  } catch(e) {
    log(`❌ Cookie JSON sai: ${e.message}`);
  }
}

// middleware
app.use(bodyParser.urlencoded({ extended: true }));

// trang chính
app.get('/', (req, res) => {
  const button = state.running ? 'Stop' : 'Start';
  res.send(`
    <html><body style="font-family:sans-serif">
      <h3>KeepVNC – Giả truy cập bằng Cookie</h3>
      <form method="POST" action="/toggle">
        URL: <input name="url" style="width:300px" value="${config.url}"/><br/>
        Cookies JSON: <textarea name="cookies" rows="4" cols="50">${config.cookies}</textarea><br/>
        <button type="submit">${button}</button>
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

// bật/tắt
app.post('/toggle', (req, res) => {
  const { url, cookies } = req.body;
  config = { url, cookies };
  fs.writeFileSync(configPath, JSON.stringify(config));

  if (state.running) {
    clearInterval(state.interval);
    state.running = false;
    log('🛑 Stopped');
  } else {
    state.interval = setInterval(sendRequest, 5000);
    state.running = true;
    log('🚀 Started');
  }
  res.redirect('/');
});

// trả log
app.get('/log', (req, res) => {
  const t = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  res.send(t);
});

app.listen(PORT, () => console.log(`Server chạy http://localhost:${PORT}`));
