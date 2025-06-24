import express from 'express';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';
import fs from 'fs/promises'; // Import fs/promises để dùng async/await với file system
import path from 'path'; // Để xử lý đường dẫn file
import { fileURLToPath } from 'url'; // Để lấy __dirname trong ES Modules

const app = express();
const PORT = 3000;

// Sử dụng middleware để parse JSON body trong request
app.use(express.json());

// Xác định đường dẫn thư mục hiện tại cho ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn đến file lưu trữ dữ liệu
const DATA_FILE = path.join(__dirname, 'reloader_data.json');

let reloadIntervalId = null; // Biến để lưu ID của interval
let currentTargetUrl = '';
let currentCookies = [];

// Hàm khởi tạo: đọc dữ liệu đã lưu từ file khi server khởi động
async function loadSavedData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsedData = JSON.parse(data);
        currentTargetUrl = parsedData.url || '';
        currentCookies = parsedData.cookies || [];
        sendLogToClients('Đã tải dữ liệu cấu hình từ server.', 'info');

        // *** THAY ĐỔI QUAN TRỌNG: Tự động bắt đầu reload nếu có dữ liệu ***
        if (currentTargetUrl && currentCookies.length > 0) {
            startReloadProcess(currentTargetUrl, currentCookies); // Hàm mới để bắt đầu reload
            sendLogToClients('Đã tự động bắt đầu quá trình reload dựa trên dữ liệu đã lưu.', 'info');
        } else {
            sendLogToClients('Không có dữ liệu cấu hình được lưu hoặc dữ liệu không đầy đủ. Sẽ không tự động reload.', 'warning');
        }

    } catch (error) {
        if (error.code === 'ENOENT') {
            sendLogToClients('File dữ liệu cấu hình chưa tồn tại. Sẽ tạo mới khi lưu.', 'warning');
            await saveCurrentData(); // Lưu dữ liệu rỗng ban đầu nếu file không tồn tại
        } else {
            sendLogToClients(`Lỗi khi tải dữ liệu cấu hình: ${error.message}`, 'error');
        }
    }
}

// Hàm lưu dữ liệu hiện tại vào file
async function saveCurrentData() {
    const dataToSave = {
        url: currentTargetUrl,
        cookies: currentCookies
    };
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
        sendLogToClients('Đã lưu dữ liệu cấu hình vào server.', 'info');
    } catch (error) {
        sendLogToClients(`Lỗi khi lưu dữ liệu cấu hình: ${error.message}`, 'error');
    }
}


// Khởi tạo WebSocket Server (sẽ gắn vào server HTTP sau)
const wss = new WebSocketServer({ noServer: true });

// Hàm gửi log tới tất cả các client WebSocket đang kết nối
function sendLogToClients(message, type = 'info') {
    const formattedMessage = {
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour12: false }), // Định dạng 24h
        message: message,
        type: type
    };
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify(formattedMessage));
        }
    });
    // Ghi log ra console của Node.js server
    console.log(`[${formattedMessage.timestamp}] [${formattedMessage.type.toUpperCase()}] ${formattedMessage.message}`);
}

// Hàm chuyển đổi JSON cookie sang chuỗi định dạng header
function convertCookiesJsonToString(cookiesJson) {
    if (!Array.isArray(cookiesJson)) {
        return '';
    }
    return cookiesJson
        .filter(cookie => cookie.name && cookie.value)
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
}

// Hàm thực hiện việc reload trang
async function performReload() {
    if (!currentTargetUrl || currentCookies.length === 0) {
        // Không gửi log liên tục nếu chưa có cấu hình để tránh spam
        // sendLogToClients('Chưa có URL hoặc cookie để reload. Vui lòng cấu hình.', 'warning');
        return;
    }

    const cookiesString = convertCookiesJsonToString(currentCookies);
    sendLogToClients(`Đang tải lại: ${currentTargetUrl}`, 'info');

    try {
        const response = await fetch(currentTargetUrl, {
            method: 'GET',
            headers: {
                'Cookie': cookiesString,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            }
        });

        if (response.ok) {
            const text = await response.text();
            const logMessage = `SUCCESS: ${currentTargetUrl} - Status: ${response.status}`;
            sendLogToClients(logMessage, 'success');

            // Kiểm tra dấu hiệu đăng nhập đơn giản (ví dụ với Google)
            if (currentTargetUrl.includes('google.com') && text.includes('Sign in') && !text.includes('Sign out')) {
                 sendLogToClients('Có vẻ như phiên đăng nhập đã hết hạn hoặc không hoạt động.', 'warning');
            } else {
                 sendLogToClients('Trạng thái đăng nhập có vẻ được duy trì.', 'info');
            }

        } else {
            const logMessage = `FAILED: ${currentTargetUrl} - Status: ${response.status} ${response.statusText}`;
            sendLogToClients(logMessage, 'error');
        }
    } catch (error) {
        const logMessage = `ERROR: ${currentTargetUrl} - ${error.message}`;
        sendLogToClients(logMessage, 'error');
    }
}

// Hàm tách riêng logic bắt đầu reload để có thể gọi từ nhiều nơi
function startReloadProcess(url, cookies) {
    currentTargetUrl = url;
    currentCookies = cookies;

    if (reloadIntervalId) {
        clearInterval(reloadIntervalId); // Dừng nếu đang chạy
    }

    performReload(); // Chạy lần đầu tiên ngay lập tức

    // Thiết lập interval để chạy lại mỗi 5 giây
    reloadIntervalId = setInterval(performReload, 5000); // 5 giây
}


// --- API Endpoints ---

// API để tải dữ liệu đã lưu trữ từ server
app.get('/load-data', (req, res) => {
    res.json({
        url: currentTargetUrl,
        cookies: currentCookies
    });
});

app.post('/start-reload', async (req, res) => { // Thêm async ở đây
    const { url, cookies } = req.body;

    if (!url || !cookies || !Array.isArray(cookies)) {
        return res.status(400).json({ message: 'URL và Cookie (dạng mảng JSON) không được trống.' });
    }

    startReloadProcess(url, cookies); // Gọi hàm bắt đầu reload

    await saveCurrentData(); // Lưu dữ liệu vào file ngay sau khi cập nhật

    res.json({ message: 'Bắt đầu reload trang định kỳ.', url: currentTargetUrl });
});

app.post('/stop-reload', (req, res) => {
    if (reloadIntervalId) {
        clearInterval(reloadIntervalId);
        reloadIntervalId = null;
        sendLogToClients('Đã tạm dừng reload trang.', 'info');
        res.json({ message: 'Đã tạm dừng reload trang.' });
    } else {
        res.json({ message: 'Reload chưa được chạy.' });
    }
});

// --- Frontend HTML, CSS, JavaScript được nhúng trực tiếp ---

const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web Reloader với Cookie</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #eef2f7;
            color: #333;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
        }

        .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 700px;
            box-sizing: border-box;
        }

        h1 {
            color: #0056b3;
            text-align: center;
            margin-bottom: 25px;
            font-size: 2em;
        }

        h2 {
            color: #0056b3;
            margin-top: 25px;
            margin-bottom: 15px;
            font-size: 1.5em;
        }

        .input-group {
            margin-bottom: 20px;
        }

        .input-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #555;
        }

        .input-group input[type="url"],
        .input-group textarea {
            width: 100%;
            padding: 12px 15px;
            border: 1px solid #cce0ff;
            border-radius: 8px;
            box-sizing: border-box;
            font-size: 1em;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .input-group input[type="url"]:focus,
        .input-group textarea:focus {
            border-color: #007bff;
            box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
            outline: none;
        }

        .input-group textarea {
            resize: vertical;
            min-height: 120px;
            font-family: 'Courier New', Courier, monospace;
        }

        .buttons {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 30px;
            margin-bottom: 40px;
        }

        .buttons button {
            padding: 12px 30px;
            font-size: 1.1em;
            cursor: pointer;
            border: none;
            border-radius: 8px;
            color: #fff;
            font-weight: bold;
            transition: background-color 0.3s ease, transform 0.2s ease;
        }

        #startButton {
            background-color: #28a745;
        }

        #startButton:hover {
            background-color: #218838;
            transform: translateY(-2px);
        }

        #stopButton {
            background-color: #dc3545;
        }

        #stopButton:hover {
            background-color: #c82333;
            transform: translateY(-2px);
        }

        .log-output #logArea {
            background-color: #f8fafd;
            border: 1px solid #e0e7ee;
            padding: 15px;
            min-height: 250px;
            max-height: 500px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            border-radius: 8px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.95em;
            line-height: 1.5;
            color: #4a4a4a;
        }

        .log-output #logArea span.info { color: #4a4a4a; }
        .log-output #logArea span.success { color: #28a745; }
        .log-output #logArea span.error { color: #dc3545; }
        .log-output #logArea span.warning { color: #ffc107; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Web Reloader với Cookie</h1>

        <div class="input-group">
            <label for="urlInput">Địa chỉ trang web:</label>
            <input type="url" id="urlInput" placeholder="https://example.com" value="https://www.google.com">
        </div>

        <div class="input-group">
            <label for="cookieInput">Cookie (dạng JSON Array từ Cookie Editor):</label>
            <textarea id="cookieInput" rows="10"
            placeholder='[{"domain": ".example.com", "name": "session", "value": "xyz"}, {"name": "csrf", "value": "abc"}]'></textarea>
        </div>

        <div class="buttons">
            <button id="startButton">Bắt đầu Reload</button>
            <button id="stopButton">Tạm dừng</button>
        </div>

        <div class="log-output">
            <h2>Log kết quả:</h2>
            <pre id="logArea"></pre>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', async () => {
            const urlInput = document.getElementById('urlInput');
            const cookieInput = document.getElementById('cookieInput');
            const startButton = document.getElementById('startButton');
            const stopButton = document.getElementById('stopButton');
            const logArea = document.getElementById('logArea');

            let ws; // Biến để lưu trữ kết nối WebSocket

            // Hàm để thêm log vào khu vực hiển thị
            function appendLog(message, type = 'info') {
                const span = document.createElement('span');
                span.classList.add(type);
                span.textContent = \`[\${new Date().toLocaleTimeString('vi-VN', { hour12: false })}] \${message}\\n\`;
                logArea.appendChild(span);
                logArea.scrollTop = logArea.scrollHeight; // Cuộn xuống cuối
                console.log(\`[Log Web] [\${type.toUpperCase()}] \${message}\`); // Ghi log ra console trình duyệt
            }

            // Tải dữ liệu đã lưu từ server khi trang load
            try {
                const response = await fetch('/load-data');
                const data = await response.json();
                if (data.url) {
                    urlInput.value = data.url;
                }
                if (data.cookies && data.cookies.length > 0) {
                    cookieInput.value = JSON.stringify(data.cookies, null, 2); // Định dạng lại JSON cho dễ đọc
                }
                appendLog('Đã tải dữ liệu cấu hình từ server.', 'info');
            } catch (error) {
                appendLog(\`Lỗi khi tải dữ liệu cấu hình từ server: \${error.message}\`, 'error');
            }


            // Thiết lập kết nối WebSocket
            function connectWebSocket() {
                if (ws && ws.readyState === ws.OPEN) {
                    return;
                }
                ws = new WebSocket(\`ws://\${window.location.host}/ws\`);

                ws.onopen = () => {
                    appendLog('Đã kết nối với Server WebSocket.', 'info');
                };

                ws.onmessage = (event) => {
                    try {
                        const logData = JSON.parse(event.data);
                        appendLog(logData.message, logData.type);
                    } catch (e) {
                        appendLog(\`Received raw WS message: \${event.data}\`, 'info');
                    }
                };

                ws.onclose = (event) => {
                    appendLog(\`Kết nối WebSocket đã đóng. Mã: \${event.code}, Lý do: \${event.reason}\`, 'warning');
                    // Thử kết nối lại sau một khoảng thời gian
                    setTimeout(connectWebSocket, 3000);
                };

                ws.onerror = (error) => {
                    appendLog(\`Lỗi WebSocket: \${error.message}\`, 'error');
                    ws.close();
                };
            }

            connectWebSocket(); // Kết nối WebSocket ngay khi tải trang

            startButton.addEventListener('click', async () => {
                const url = urlInput.value.trim();
                let cookies = [];

                try {
                    const cookieText = cookieInput.value.trim();
                    if (cookieText) {
                        // Kiểm tra nếu chuỗi có dấu bằng, khả năng là chuỗi cookie thô
                        if (cookieText.includes('=')) {
                            appendLog('Bạn có vẻ đã dán chuỗi cookie thô. Vui lòng dán JSON array từ Cookie Editor.', 'warning');
                            return;
                        }
                        cookies = JSON.parse(cookieText);
                        if (!Array.isArray(cookies) || cookies.some(c => typeof c !== 'object' || !c.name || !c.value)) {
                            throw new Error('Định dạng cookie JSON không hợp lệ. Phải là một mảng các đối tượng có thuộc tính "name" và "value".');
                        }
                    } else {
                        appendLog('Cảnh báo: Không có cookie nào được nhập. Trang web có thể không duy trì trạng thái đăng nhập.', 'warning');
                    }
                } catch (error) {
                    appendLog(\`Lỗi parse cookie: \${error.message}\`, 'error');
                    return;
                }

                if (!url) {
                    appendLog('Vui lòng nhập địa chỉ trang web.', 'error');
                    return;
                }
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    appendLog('Địa chỉ URL phải bắt đầu bằng http:// hoặc https://', 'error');
                    return;
                }

                appendLog('Đang gửi yêu cầu bắt đầu reload...', 'info');

                try {
                    const response = await fetch('/start-reload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ url, cookies }),
                    });

                    const data = await response.json();
                    if (response.ok) {
                        appendLog(\`Server phản hồi: \${data.message} - URL: \${data.url}\`, 'success');
                    } else {
                        appendLog(\`Lỗi từ server: \${data.message || 'Không rõ lỗi'}\`, 'error');
                    }
                } catch (error) {
                    appendLog(\`Lỗi kết nối đến server: \${error.message}. Đảm bảo server Node.js đang chạy.\`, 'error');
                }
            });

            stopButton.addEventListener('click', async () => {
                appendLog('Đang gửi yêu cầu tạm dừng reload...', 'info');
                try {
                    const response = await fetch('/stop-reload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    });

                    const data = await response.json();
                    if (response.ok) {
                        appendLog(\`Server phản hồi: \${data.message}\`, 'success');
                    } else {
                        appendLog(\`Lỗi từ server: \${data.message || 'Không rõ lỗi'}\`, 'error');
                    }
                } catch (error) {
                    appendLog(\`Lỗi kết nối đến server: \${error.message}\`, 'error');
                }
            });
        });
    </script>
</body>
</html>
`;

// Middleware để phục vụ HTML content trực tiếp từ Express
app.get('/', (req, res) => {
    res.send(htmlContent);
});

// Lắng nghe cổng HTTP
const server = app.listen(PORT, async () => { // Thêm async ở đây
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    await loadSavedData(); // Tải dữ liệu khi server khởi động
});

// Nâng cấp kết nối HTTP lên WebSocket khi có yêu cầu
server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
        wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// Xử lý kết nối WebSocket
wss.on('connection', ws => {
    console.log('Client WebSocket đã kết nối.');
    ws.on('close', () => console.log('Client WebSocket đã ngắt kết nối.'));
    ws.on('error', error => console.error('Lỗi WebSocket:', error));
});
