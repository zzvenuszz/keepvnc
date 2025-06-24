// keepVNC.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = 3000;

let configPath = 'config.json';
let logPath = 'log.txt';
let state = { running: false, interval: null };
let config = { url: '', cookies: '' };

// Load cấu hình nếu có
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

// Gửi request, tự chuyển JSON cookie thành header
function sendRequest() {
  if (!config.url || !config.cookies) return;

  let cookieStr;
  try {
    const arr = JSON.parse(config.cookies);
    if (!Array.isArray(arr)) throw new Error('Cookie phải là mảng JSON');
    cookieStr = arr.map(c => `${c.name}=${c.value}`).join('; ');
    log(`> Gửi Cookie header: ${cookieStr}`);
  } catch (e) {
    return log(`❌ JSON cookie sai: ${e.message}`);
  }

  axios.get(config.url, { headers: { Cookie: cookieStr } })
    .then(res => log(`✅ Trả về status: ${res.status}`))
    .catch(err => {
      if (err.response) {
        log(`❌ Status ${err.response.status}, body: ${JSON.stringify(err.response.data)}`);
      } else {
        log(`❌ Lỗi: ${err.message}`);
      }
    });
}

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const btn = state.running ? 'Dừng' : 'Bắt đầu';
  res.send(`
    <html><body style="font-family:Arial,sans-serif">
    <h3>KeepVNC – Giả truy cập bằng Cookie JSON</h3>
    <form method="POST" action="/toggle">
      URL: <input name="url" style="width:400px" value="${config.url}"/><br/><br/>
      Cookies JSON Array:<br/>
      <textarea name="cookies" rows="6" cols="60">${config.cookies}</textarea><br/><br/>
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
  const { url, cookies } = req.body;
  config = { url, cookies };
  fs.writeFileSync(configPath, JSON.stringify(config));

  if (state.running) {
    clearInterval(state.interval);
    state.running = false;
    log('🛑 Đã dừng.');
  } else {
    state.interval = setInterval(sendRequest, 5000);
    state.running = true;
    log('🚀 Đã bắt đầu.');
  }
  res.redirect('/');
});

app.get('/log', (req, res) => {
  const t = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  res.send(t);
});

app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
