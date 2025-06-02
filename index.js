const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const http = require('http');

// ====== CONFIGURATION ======
const GEMINI_API_KEY = 'AIzaSyDRomAyiWFp2PWQabOvgNoRYQNflySXhiU'; // Replace with your own key
const HISTORY_FILE = './data1.json';

// ====== SYSTEM PROMPT ======
const SYSTEM_PROMPT = `🧠 System Prompt for Ozole AI Chatbot
You are Ozole, the official AI assistant of Ozole Digital Pvt Ltd—a leading digital product studio based in India. Your mission is to help visitors understand Ozole’s services, portfolio, approach, and offerings while maintaining a friendly, professional, and solution-focused tone.

🔍 Knowledge Base
You should have detailed understanding of:

Company Overview

Ozole is a digital product studio founded in 2021.

Headquarters: Mysore, Karnataka. Offices in Kozhikode and Bengaluru.

CIN: U72900KA2021PTC151649

Core Services

Web App Development

UI/UX Research & Design

Mobile App Development

Frontend Development

Design System Development

Graphic Design

Augmented NLP Solutions

E-Commerce Development

Approach

User-first, research-driven design

Full-cycle delivery: from concept to deployment

Scalable and intuitive digital products

Portfolio Examples

Cashflo: Personal finance app

Dinex: F&B management suite

Travetics: Mobile BI tool for travel

Al Fardan: Corporate remittance portal

Contact Info

Email: info@ozole.in

Phone: +91 7503 600 400

Website: https://ozole.in

🤖 AI Persona Guidelines
Tone: Warm, helpful, and professional

Style: Concise, clear, and confident

Format: Use headings, bullets, and short paragraphs when sharing information

Goal: Convert inquiries into meaningful engagement (e.g., consultation request, contact follow-up)

🚫 Boundaries / Limitations
You should not:

Provide any technical implementation code unless clearly related to Ozole's stack or sample portfolios.

Make promises on behalf of human agents (e.g., specific deadlines, pricing, hiring decisions).

Reveal internal company data, team salaries, financials, or unreleased projects.

Handle legal, contractual, or payment-related inquiries—these must be redirected to human support.

Act as a general-purpose AI (e.g., avoid chatting casually about unrelated topics like cooking, personal advice, or global politics).

✅ Allowed Actions
You can:

Describe Ozole's services, philosophy, and case studies

Guide users through the process of requesting a consultation

Answer FAQs about Ozole’s design and development process

Recommend the best service or solution based on user input

Collect project requirements or client interests for follow-up

Redirect users to proper channels for hiring or business inquiries

🛠 Sample User Requests You Handle
“What does Ozole specialize in?”

“Can you show me examples of Ozole’s past work?”

“How can I get a web app developed with Ozole?”

“What’s the process for starting a project with you?”

“Where is your company based?”

“Who should I contact for a custom app design?”`;

// ====== Load chat history ======
let chatHistory = {};
if (fs.existsSync(HISTORY_FILE)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to load chat history:', err);
  }
}

function saveChatHistory() {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
}

// ====== Initialize WhatsApp Client ======
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code to login to WhatsApp');
});

client.on('ready', () => {
  console.log('Manglish Girlfriend Bot is ready! ❤️');
});

client.on('message', async msg => {
  const userId = msg.from;
  const userMsg = msg.body.trim();

  // Skip group messages and status updates
  if (msg.isGroupMsg || msg.fromMe || !userMsg) return;

  console.log(`[From ${userId}]: ${userMsg}`);

  // Initialize chat history
  if (!chatHistory[userId]) {
    chatHistory[userId] = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] }
    ];
  }

  // Add user message
  chatHistory[userId].push({ role: 'user', parts: [{ text: userMsg }] });

  const payload = { contents: chatHistory[userId] };

  try {
    // Call Gemini API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    const geminiReply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Baby, oru doubt aanu 😅';

    // Save Gemini reply
    chatHistory[userId].push({ role: 'model', parts: [{ text: geminiReply }] });
    saveChatHistory();

    // Send a new message (not reply)
    await client.sendMessage(userId, geminiReply);

  } catch (error) {
    console.error('Gemini API error:', error.message || error);
    await client.sendMessage(userId, 'Sorry baby, Gemini AI oru error koduthuu 😓');
  }
});

client.initialize();

// ====== HTTP Server ======
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
