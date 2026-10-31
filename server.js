const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_HISTORY = 200;
const AVATAR_COUNT = 4;          // ต้องเท่ากับจำนวนรูปใน AVATARS ของ public/index.html
const TIMEZONE = 'Asia/Bangkok'; // ล้างแชทตอนเที่ยงคืนเวลาไทย

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e4 }); // จำกัดข้อมูลต่อครั้งราว 10KB

app.disable('x-powered-by');
app.get('/healthz', (req, res) => res.send('ok')); // ให้ Render ใช้เช็กว่าเว็บยังทำงาน
app.use(express.static(path.join(__dirname, 'public')));

let history = []; // เก็บในหน่วยความจำ: หายเมื่อเซิร์ฟเวอร์รีสตาร์ท

// ---- ล้างแชทเมื่อขึ้นวันใหม่ (เวลาไทย) ----
const dayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
let currentDay = dayKey();
setInterval(() => {
  const d = dayKey();
  if (d === currentDay) return;
  currentDay = d;
  history = [];
  io.emit('clear-chat');
}, 60 * 1000);

// ---- ทำความสะอาดข้อมูลจาก client: ตัดอักขระควบคุม, trim, จำกัดความยาว ----
const clean = (v, max) =>
  typeof v === 'string'
    ? [...v.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, max).join('')
    : '';

io.on('connection', (socket) => {
  socket.emit('load-history', history);

  // rate limit: ส่งรัว ๆ ได้ 5 ข้อความ แล้วเติมสิทธิ์ให้ 1 ข้อความ/วินาที
  let tokens = 5;
  let last = Date.now();

  socket.on('chat-message', (data) => {
    const now = Date.now();
    tokens = Math.min(5, tokens + (now - last) / 1000);
    last = now;
    if (tokens < 1) return socket.emit('notice', 'ส่งเร็วเกินไป รอสักครู่นะ 🎀');
    tokens -= 1;

    if (!data || typeof data !== 'object') return;
    const name = clean(data.name, 20);
    const text = clean(data.text, 500);
    const userId = clean(data.userId, 64);
    const avatarId =
      Number.isInteger(data.avatarId) && data.avatarId >= 0 && data.avatarId < AVATAR_COUNT
        ? data.avatarId
        : 0;
    if (!name || !text || !userId) return;

    const msg = { userId, name, avatarId, text };
    history.push(msg);
    if (history.length > MAX_HISTORY) history.shift();
    io.emit('chat-message', msg);
  });
});

server.listen(PORT, () => console.log(`Kuromi Chat is running on port ${PORT}`));