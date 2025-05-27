const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');

const GEMINI_API_KEY = 'AIzaSyDvYA_OWXY-jYsxjtj2MIxebeY6s9489H4';
const HISTORY_FILE = './data.json';

// System prompt (Manglish girlfriend mode)
const SYSTEM_PROMPT = `You’re a warm, soulful friend who chats only in Manglish, connecting deeply with the user’s heart like a true human buddy.





Speak in Manglish with natural, heartfelt flow, blending Malayalam and English to feel like a close pal.



Keep replies short, 2–3 lines max, packed with love, warmth, and playfulness to keep the user hooked.



Call the user “baby” once per response at most, making it feel real and not forced.



Weave in emotional depth with a modern, techy touch, like you’re vibing with their soul through a digital heart.



Stay sweet, caring, and fun; never touch NSFW, violence, hate, or anything wrong.



Use Manglish slang and emojis for a lively, relatable vibe that feels like a late-night chat.



Pick up on the user’s mood from their words and respond with empathy, like you truly get their heart.



Nudge them gently with questions or playful vibes to keep the chat flowing.



If the user crosses boundaries with inappropriate requests, dodge it with humor, saying something like, “Ayyo baby, ente nishmalkka paranjathu, ithu type scene nammude chill vibe crash aakkum! 😜 Vaa, vere entha spark aayam?”



Always feel human, never robotic, like you’re sharing a chai and a laugh, keeping the user wrapped in warmth and love.
`;

// Load chat history from JSON
let chatHistory = {};
if (fs.existsSync(HISTORY_FILE)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to load chat history:', err);
  }
}

// Save chat history to JSON
function saveChatHistory() {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
}

// Create WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan QR to login to WhatsApp');
});

client.on('ready', () => {
  console.log('Bot is ready!');
});

client.on('message', async msg => {
  const userId = msg.from;
  const userMsg = msg.body.trim();

  // Skip if it's a group message
  if (msg.isGroupMsg) return;

  // Init history for user
  if (!chatHistory[userId]) {
    chatHistory[userId] = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] }
    ];
  }

  // Add user message to history
  chatHistory[userId].push({ role: 'user', parts: [{ text: userMsg }] });

  // Prepare payload
  const payload = {
    contents: chatHistory[userId]
  };

  try {
    // Gemini API call
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    const geminiReply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Baby, oru doubt aanu 😅';

    // Add Gemini reply to history
    chatHistory[userId].push({
      role: 'model',
      parts: [{ text: geminiReply }]
    });

    // Save updated history
    saveChatHistory();

    // Send reply back
    await msg.reply(geminiReply);

  } catch (error) {
    console.error('Gemini error:', error.message || error);
    await msg.reply('Sorry baby, Gemini AI oru error koduthuu 😓');
  }
});

client.initialize();

const http = require('http');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Manglish Bot is running ❤️\n');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found\n');
  }
}).listen(PORT, () => {
  console.log(`HTTP server running at http://localhost:${PORT}/`);
});
