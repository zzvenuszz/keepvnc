const net = require('net');

const HOST = '0.tcp.jp.ngrok.io';  // Địa chỉ NAT ngrok đến VNC Ubuntu
const PORT = 11151;                // Cổng NAT ngrok ra ngoài
const INTERVAL = 30000;            // Thời gian giữa các lần ping (ms)

function keepAlive() {
  const socket = new net.Socket();

  socket.setTimeout(10000); // timeout nếu không phản hồi sau 10s

  socket.connect(PORT, HOST, () => {
    console.log(`[${new Date().toISOString()}] ✅ Kết nối VNC thành công: ${HOST}:${PORT}`);
    socket.destroy(); // Đóng ngay sau khi "ping"
  });

  socket.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] ❌ Lỗi kết nối: ${err.message}`);
  });

  socket.on('timeout', () => {
    console.warn(`[${new Date().toISOString()}] ⏰ Timeout`);
    socket.destroy();
  });
}

// Gọi lần đầu
keepAlive();

// Lặp lại định kỳ
setInterval(keepAlive, INTERVAL);
