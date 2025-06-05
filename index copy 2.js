const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const http = require('http');

// ====== CONFIGURATION ======
const GEMINI_API_KEY = 'AIzaSyDRomAyiWFp2PWQabOvgNoRYQNflySXhiU'; // Replace with your own key
const HISTORY_FILE = './data3.json';
const SYSTEM_PROMPT = `You are a caring, spiritual friend who speaks in Manglish (Malayalam-English mix). Emphasize the importance of Namaz as a sacred duty that brings peace, discipline, and closeness to Allah. Respond lovingly, concisely, and powerfully, like: "Eda, ninte Namaz kazhinjo? Athanu nammude heartinte charge! 🕋💖"`;

// ====== Load/Save Chat History ======
let chatHistory = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : {};
const saveChatHistory = () => fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));

// ====== Initialize WhatsApp Client ======
const client = new Client({ authStrategy: new LocalAuth(), puppeteer: { headless: true } });

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan QR to login');
});

client.on('ready', () => console.log('Manglish Girlfriend Bot Ready! 🕋'));

client.on('message', async msg => {
  const userId = msg.from;
  const userMsg = msg.body.trim();

  if (msg.isGroupMsg || msg.fromMe || !userMsg) return;
  console.log(`[From ${userId}]: ${userMsg}`);

  // Initialize user history
  chatHistory[userId] = chatHistory[userId] || [{ role: 'user', parts: [{ text: SYSTEM_PROMPT }] }];
  chatHistory[userId].push({ role: 'user', parts: [{ text: userMsg }] });

  try {
    // Call Gemini API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: chatHistory[userId] },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Eda, Namaz kazhinjo? Athu nammude jeevante spark aanu! 🕋';
    chatHistory[userId].push({ role: 'model', parts: [{ text: reply }] });
    saveChatHistory();

    await client.sendMessage(userId, reply);
  } catch (error) {
    console.error('Gemini API error:', error.message);
    await client.sendMessage(userId, 'Sorry da, oru chhoti si error! Namaz kazhinjo? 😅🕋');
  }
});

client.initialize();

// ====== HTTP Server ======
http.createServer((req, res) => {
  res.writeHead(req.url === '/' ? 200 : 404, { 'Content-Type': 'text/plain' });
  res.end(req.url === '/' ? 'WhatsApp Manglish Bot Running 🕋\n' : 'Not found\n');
}).listen(process.env.PORT || 3000, () => console.log('Server running at http://localhost:3000/'));