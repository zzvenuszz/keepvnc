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
    console.log('[SERVER - KHỞI TẠO] Bắt đầu tải dữ liệu cấu hình...');
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsedData = JSON.parse(data);
        currentTargetUrl = parsedData.url || '';
        currentCookies = parsedData.cookies || [];
        
        console.log(`[SERVER - KHỞI TẠO] Đã đọc file '${DATA_FILE}'. URL: '${currentTargetUrl}', Cookies: ${currentCookies.length} mục.`);
        
        // Gửi log qua WebSocket cho client
        sendLogToClients('Đã tải dữ liệu cấu hình từ server.', 'info');

        // Tự động bắt đầu reload nếu có dữ liệu hợp lệ
        if (currentTargetUrl && currentCookies.length > 0) {
            startReloadProcess(currentTargetUrl, currentCookies);
            console.log('[SERVER - KHỞI TẠO] Tự động bắt đầu quá trình reload với dữ liệu đã tải.');
            sendLogToClients('Đã tự động bắt đầu quá trình reload dựa trên dữ liệu đã lưu.', 'info');
        } else {
            console.log('[SERVER - KHỞI TẠO] Không có dữ liệu cấu hình đầy đủ để tự động reload.');
            sendLogToClients('Không có dữ liệu cấu hình được lưu hoặc dữ liệu không đầy đủ. Sẽ không tự động reload.', 'warning');
        }

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`[SERVER - KHỞI TẠO] File dữ liệu cấu hình '${DATA_FILE}' chưa tồn tại. Sẽ tạo mới khi có dữ liệu được lưu.`);
            sendLogToClients('File dữ liệu cấu hình chưa tồn tại. Sẽ tạo mới khi lưu.', 'warning');
            await saveCurrentData(); // Lưu dữ liệu rỗng ban đầu nếu file không tồn tại
        } else {
            console.error(`[SERVER - KHỞI TẠO LỖI] Lỗi khi tải dữ liệu cấu hình từ file: ${error.message}`);
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
    console.log(`[SERVER - LƯU DỮ LIỆU] Đang lưu URL: '${currentTargetUrl}', Cookies: ${currentCookies.length} mục vào file.`);
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
        console.log(`[SERVER - LƯU DỮ LIỆU] Đã lưu dữ liệu cấu hình vào file '${DATA_FILE}' thành công.`);
        sendLogToClients('Đã lưu dữ liệu cấu hình vào server.', 'info');
    } catch (error) {
        console.error(`[SERVER - LƯU DỮ LIỆU LỖI] Lỗi khi lưu dữ liệu cấu hình vào file: ${error.message}`);
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
    // Ghi log ra console của Node.js server
    console.log(`[SERVER WS -> CLIENTS] [${formattedMessage.timestamp}] [${formattedMessage.type.toUpperCase()}] ${formattedMessage.message}`);
    
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify(formattedMessage));
        }
    });
}

// Hàm chuyển đổi JSON cookie sang chuỗi định dạng header
function convertCookiesJsonToString(cookiesJson) {
    if (!Array.isArray(cookiesJson)) {
        console.warn('[SERVER - COOKIE] Dữ liệu cookie không phải mảng. Trả về chuỗi rỗng.');
        return '';
    }
    const cookieString = cookiesJson
        .filter(cookie => cookie.name && cookie.value)
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
    console.log(`[SERVER - COOKIE] Đã chuyển đổi ${cookiesJson.length} cookie thành chuỗi (dài ${cookieString.length} ký tự).`);
    return cookieString;
}

// Hàm thực hiện việc reload trang
async function performReload() {
    console.log('[SERVER - RELOAD] Bắt đầu thực hiện reload trang.');
    if (!currentTargetUrl) {
        console.warn('[SERVER - RELOAD] Bỏ qua reload: currentTargetUrl rỗng.');
        sendLogToClients('Chưa có URL để reload. Vui lòng cấu hình.', 'warning');
        return;
    }
    if (currentCookies.length === 0) {
        console.warn('[SERVER - RELOAD] Cảnh báo: currentCookies rỗng. Reload có thể không duy trì trạng thái đăng nhập.');
        sendLogToClients('Cảnh báo: Không có cookie nào được cấu hình. Reload có thể không duy trì trạng thái đăng nhập.', 'warning');
    }

    const cookiesString = convertCookiesJsonToString(currentCookies);
    sendLogToClients(`Đang tải lại: ${currentTargetUrl}`, 'info');
    console.log(`[SERVER - RELOAD] Gửi yêu cầu GET tới: '${currentTargetUrl}'`);
    console.log(`[SERVER - RELOAD] Sử dụng Cookie Header: '${cookiesString.substring(0, 50)}...' (chỉ hiển thị 50 ký tự đầu)`); // Log 50 ký tự đầu của cookie

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

        console.log(`[SERVER - RELOAD] Nhận được phản hồi HTTP. Status: ${response.status} ${response.statusText}`);

        if (response.ok) {
            const text = await response.text(); // Đọc toàn bộ phản hồi
            const logMessage = `SUCCESS: ${currentTargetUrl} - Status: ${response.status}`;
            sendLogToClients(logMessage, 'success');
            console.log(`[SERVER - RELOAD] Reload thành công. Status: ${response.status}.`);

            // Kiểm tra dấu hiệu đăng nhập đơn giản (ví dụ với Google)
            if (currentTargetUrl.includes('google.com') && text.includes('Sign in') && !text.includes('Sign out')) {
                 sendLogToClients('Có vẻ như phiên đăng nhập đã hết hạn hoặc không hoạt động.', 'warning');
                 console.warn('[SERVER - RELOAD] Phát hiện dấu hiệu phiên đăng nhập hết hạn.');
            } else {
                 sendLogToClients('Trạng thái đăng nhập có vẻ được duy trì.', 'info');
                 console.log('[SERVER - RELOAD] Trạng thái đăng nhập có vẻ được duy trì.');
            }

        } else {
            const logMessage = `FAILED: ${currentTargetUrl} - Status: ${response.status} ${response.statusText}`;
            sendLogToClients(logMessage, 'error');
            console.error(`[SERVER - RELOAD LỖI] Reload thất bại. Status: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        const logMessage = `ERROR: ${currentTargetUrl} - ${error.message}`;
        sendLogToClients(logMessage, 'error');
        console.error(`[SERVER - RELOAD LỖI] Lỗi khi thực hiện fetch URL: ${error.name}: ${error.message}`);
    }
}

// Hàm tách riêng logic bắt đầu reload để có thể gọi từ nhiều nơi
function startReloadProcess(url, cookies) {
    console.log(`[SERVER - ĐIỀU KHIỂN] Yêu cầu bắt đầu/cập nhật quá trình reload.`);
    
    // Cập nhật biến toàn cục
    currentTargetUrl = url;
    currentCookies = cookies;

    if (reloadIntervalId) {
        clearInterval(reloadIntervalId); // Dừng nếu đang chạy
        console.log('[SERVER - ĐIỀU KHIỂN] Đã dừng interval reload cũ (nếu có).');
    }

    performReload(); // Chạy lần đầu tiên ngay lập tức
    console.log('[SERVER - ĐIỀU KHIỂN] Đã thực hiện reload lần đầu.');

    // Thiết lập interval để chạy lại mỗi 5 giây
    reloadIntervalId = setInterval(performReload, 5000); // 5 giây
    console.log('[SERVER - ĐIỀU KHIỂN] Đã thiết lập interval reload mới, chu kỳ 5 giây.');
    sendLogToClients('Đã bắt đầu reload định kỳ mỗi 5 giây.', 'info');
}


// --- API Endpoints ---

// API để tải dữ liệu đã lưu trữ từ server
app.get('/load-data', (req, res) => {
    console.log('[SERVER - API] Nhận yêu cầu GET /load-data từ client.');
    res.json({
        url: currentTargetUrl,
        cookies: currentCookies
    });
    console.log(`[SERVER - API] Đã gửi dữ liệu cấu hình về client. URL: '${currentTargetUrl}', Cookies: ${currentCookies.length} mục.`);
});

app.post('/start-reload', async (req, res) => {
    console.log('[SERVER - API] Nhận yêu cầu POST /start-reload từ client.');
    const { url, cookies } = req.body;
    console.log(`[SERVER - API] Dữ liệu nhận được: URL='${url}', Cookies: ${cookies ? cookies.length : 0} mục.`);

    if (!url || !cookies || !Array.isArray(cookies)) {
        console.error('[SERVER - API LỖI] Yêu cầu /start-reload thiếu URL hoặc Cookie (hoặc định dạng sai).');
        return res.status(400).json({ message: 'URL và Cookie (dạng mảng JSON) không được trống hoặc định dạng không đúng.' });
    }
    
    // Gọi hàm điều khiển quá trình reload
    startReloadProcess(url, cookies);

    // Lưu dữ liệu vào file ngay sau khi cập nhật
    await saveCurrentData();

    res.json({ message: 'Bắt đầu reload trang định kỳ.', url: currentTargetUrl });
    console.log(`[SERVER - API] Phản hồi thành công cho /start-reload. Reload đang chạy cho URL: '${url}'.`);
});

app.post('/stop-reload', (req, res) => {
    console.log('[SERVER - API] Nhận yêu cầu POST /stop-reload từ client.');
    if (reloadIntervalId) {
        clearInterval(reloadIntervalId);
        reloadIntervalId = null;
        console.log('[SERVER - API] Đã dừng interval reload.');
        sendLogToClients('Đã tạm dừng reload trang.', 'info');
        res.json({ message: 'Đã tạm dừng reload trang.' });
    } else {
        console.log('[SERVER - API] Reload chưa được chạy, không có gì để dừng.');
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
                span.textContent = '[' + new Date().toLocaleTimeString('vi-VN', { hour12: false }) + '] ' + message + '\\n';
                logArea.appendChild(span);
                logArea.scrollTop = logArea.scrollHeight; // Cuộn xuống cuối
                console.log('[CLIENT LOG WEB] [' + type.toUpperCase() + '] ' + message); // Ghi log ra console trình duyệt
            }

            // Tải dữ liệu đã lưu từ server khi trang load
            console.log('[CLIENT JS] Bắt đầu tải dữ liệu cấu hình từ server...');
            try {
                const response = await fetch('/load-data');
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }
                const data = await response.json();
                console.log('[CLIENT JS] Đã nhận dữ liệu từ /load-data. URL: \'' + data.url + '\', Cookies: ' + (data.cookies ? data.cookies.length : 0) + ' mục.');
                
                if (data.url) {
                    urlInput.value = data.url;
                }
                if (data.cookies && data.cookies.length > 0) {
                    cookieInput.value = JSON.stringify(data.cookies, null, 2); // Định dạng lại JSON cho dễ đọc
                } else if (data.cookies && data.cookies.length === 0) {
                     cookieInput.value = '[]'; // Đặt giá trị rỗng nếu không có cookie
                }
                appendLog('Đã tải dữ liệu cấu hình từ server.', 'info');
                console.log('[CLIENT JS] Đã điền dữ liệu vào input form.');
            } catch (error) {
                appendLog('Lỗi khi tải dữ liệu cấu hình từ server: ' + error.message, 'error');
                console.error('[CLIENT JS LỖI] Lỗi khi tải dữ liệu cấu hình từ server: ' + error.message);
            }


            // Thiết lập kết nối WebSocket
            function connectWebSocket() {
                if (ws && ws.readyState === ws.OPEN) {
                    console.log('[CLIENT JS] WebSocket đã mở, không cần kết nối lại.');
                    return;
                }
                ws = new WebSocket('ws://' + window.location.host + '/ws');
                console.log('[CLIENT JS] Đang cố gắng kết nối WebSocket tới ws://' + window.location.host + '/ws...');

                ws.onopen = () => {
                    appendLog('Đã kết nối với Server WebSocket.', 'info');
                    console.log('[CLIENT JS] Kết nối WebSocket thành công.');
                };

                ws.onmessage = (event) => {
                    try {
                        const logData = JSON.parse(event.data);
                        appendLog(logData.message, logData.type);
                        console.log('[CLIENT JS] Nhận tin nhắn log từ server qua WS: [' + logData.type.toUpperCase() + '] ' + logData.message);
                    } catch (e) {
                        appendLog('Received raw WS message: ' + event.data, 'info');
                        console.warn('[CLIENT JS] Không thể parse tin nhắn WS: ' + event.data + '. Lỗi: ' + e.message);
                    }
                };

                ws.onclose = (event) => {
                    appendLog('Kết nối WebSocket đã đóng. Mã: ' + event.code + ', Lý do: ' + event.reason, 'warning');
                    console.warn('[CLIENT JS] Kết nối WebSocket đóng. Mã: ' + event.code + ', Lý do: ' + event.reason);
                    // Thử kết nối lại sau một khoảng thời gian
                    console.log('[CLIENT JS] Đang thử kết nối lại WebSocket sau 3 giây...');
                    setTimeout(connectWebSocket, 3000);
                };

                ws.onerror = (error) => {
                    appendLog('Lỗi WebSocket: ' + error.message, 'error');
                    console.error('[CLIENT JS LỖI] Lỗi WebSocket: ' + error.message);
                    ws.close();
                };
            }

            connectWebSocket(); // Kết nối WebSocket ngay khi tải trang

            startButton.addEventListener('click', async () => {
                console.log('[CLIENT JS] Nút "Bắt đầu Reload" được nhấn.');
                const url = urlInput.value.trim();
                let cookies = [];

                try {
                    const cookieText = cookieInput.value.trim();
                    console.log('[CLIENT JS] Nội dung Cookie input (100 ký tự đầu): ' + cookieText.substring(0, 100) + '...');
                    if (cookieText) {
                        if (cookieText.includes('=')) {
                            appendLog('Bạn có vẻ đã dán chuỗi cookie thô. Vui lòng dán JSON array từ Cookie Editor.', 'warning');
                            console.warn('[CLIENT JS] Cảnh báo: Định dạng cookie không phải JSON array. Phát hiện dấu "=".');
                            return;
                        }
                        cookies = JSON.parse(cookieText);
                        if (!Array.isArray(cookies) || cookies.some(c => typeof c !== 'object' || !c.name || !c.value)) {
                            throw new Error('Định dạng cookie JSON không hợp lệ. Phải là một mảng các đối tượng có thuộc tính "name" và "value".');
                        }
                        console.log('[CLIENT JS] Cookies đã parse thành công: ' + cookies.length + ' mục.');
                    } else {
                        appendLog('Cảnh báo: Không có cookie nào được nhập. Trang web có thể không duy trì trạng thái đăng nhập.', 'warning');
                        console.warn('[CLIENT JS] Cảnh báo: Không có cookie nào được nhập từ input.');
                    }
                } catch (error) {
                    appendLog('Lỗi parse cookie: ' + error.message, 'error');
                    console.error('[CLIENT JS LỖI] Lỗi khi parse cookie: ' + error.message);
                    return;
                }

                if (!url) {
                    appendLog('Vui lòng nhập địa chỉ trang web.', 'error');
                    console.error('[CLIENT JS] Lỗi: URL trống. Không thể tiếp tục.');
                    return;
                }
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    appendLog('Địa chỉ URL phải bắt đầu bằng http:// hoặc https://', 'error');
                    console.error('[CLIENT JS] Lỗi: URL không hợp lệ (thiếu http:// hoặc https://).');
                    return;
                }

                appendLog('Đang gửi yêu cầu bắt đầu reload đến server...', 'info');
                console.log('[CLIENT JS] Đang gửi POST request tới /start-reload...');
                console.log('[CLIENT JS] Dữ liệu gửi đi: URL=\'' + url + '\', Cookies: ' + cookies.length + ' mục.');

                try {
                    const response = await fetch('/start-reload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ url, cookies }),
                    });

                    console.log('[CLIENT JS] Đã nhận phản hồi từ /start-reload. Status: ' + response.status + '.');
                    const data = await response.json();
                    if (response.ok) {
                        appendLog('Server phản hồi: ' + data.message + ' - URL: ' + data.url, 'success');
                        console.log('[CLIENT JS] Server phản hồi thành công: ' + data.message);
                    } else {
                        appendLog('Lỗi từ server: ' + (data.message || 'Không rõ lỗi'), 'error');
                        console.error('[CLIENT JS] Server phản hồi lỗi: ' + (data.message || 'Không rõ lỗi'));
                    }
                } catch (error) {
                    appendLog('Lỗi kết nối đến server: ' + error.message + '. Đảm bảo server Node.js đang chạy.', 'error');
                    console.error('[CLIENT JS LỖI] Lỗi kết nối đến server: ' + error.message);
                }
            });

            stopButton.addEventListener('click', async () => {
                console.log('[CLIENT JS] Nút "Tạm dừng" được nhấn.');
                appendLog('Đang gửi yêu cầu tạm dừng reload đến server...', 'info');
                try {
                    const response = await fetch('/stop-reload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    });

                    console.log('[CLIENT JS] Đã nhận phản hồi từ /stop-reload. Status: ' + response.status + '.');
                    const data = await response.json();
                    if (response.ok) {
                        appendLog('Server phản hồi: ' + data.message, 'success');
                        console.log('[CLIENT JS] Server phản hồi thành công: ' + data.message);
                    } else {
                        appendLog('Lỗi từ server: ' + (data.message || 'Không rõ lỗi'), 'error');
                        console.error('[CLIENT JS] Server phản hồi lỗi: ' + (data.message || 'Không rõ lỗi'));
                    }
                } catch (error) {
                    appendLog('Lỗi kết nối đến server: ' + error.message, 'error');
                    console.error('[CLIENT JS LỖI] Lỗi kết nối đến server: ' + error.message);
                }
            });
        });
    </script>
</body>
</html>
`;

// Middleware để phục vụ HTML content trực tiếp từ Express
app.get('/', (req, res) => {
    console.log('[SERVER - WEB] Nhận yêu cầu GET / từ trình duyệt. Đang gửi HTML.');
    res.send(htmlContent);
});

// Lắng nghe cổng HTTP
const server = app.listen(PORT, async () => {
    console.log(`[SERVER - KHỞI ĐỘNG] Server đang chạy và lắng nghe tại http://localhost:${PORT}`);
    await loadSavedData(); // Tải dữ liệu khi server khởi động
});

// Nâng cấp kết nối HTTP lên WebSocket khi có yêu cầu
server.on('upgrade', (request, socket, head) => {
    console.log(`[SERVER - WEBSOCKET] Nhận yêu cầu nâng cấp WebSocket cho URL: ${request.url}`);
    if (request.url === '/ws') {
        wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
        });
    } else {
        console.warn('[SERVER - WEBSOCKET] Từ chối nâng cấp WebSocket: URL không khớp /ws');
        socket.destroy();
    }
});

// Xử lý kết nối WebSocket
wss.on('connection', ws => {
    console.log('[SERVER - WEBSOCKET] Một client WebSocket mới đã kết nối.');
    ws.on('close', () => console.log('[SERVER - WEBSOCKET] Một client WebSocket đã ngắt kết nối.'));
    ws.on('error', error => console.error('[SERVER - WEBSOCKET LỖI] Lỗi WebSocket:', error.message));
});
