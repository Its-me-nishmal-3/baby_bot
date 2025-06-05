const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ====== CONFIGURATION ======
const GEMINI_API_KEY = 'AIzaSyDRomAyiWFp2PWQabOvgNoRYQNflySXhiU'; // Replace with your own key
const DATA_DIR = './user_data';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function getUserFile(userId) {
  return path.join(DATA_DIR, `${userId}.json`);
}

function loadUserData(userId) {
  const file = getUserFile(userId);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {
        history: [],
        context: { habits: {}, journal: {}, mood_today: null },
        tasks: [], // { text, priority, dateCreated }
        reminders: [], // { text, when, priority }
        moods: [] // { date, mood }
      };
    }
  }
  return {
    history: [],
    context: { habits: {}, journal: {}, mood_today: null },
    tasks: [],
    reminders: [],
    moods: []
  };
}

function saveUserData(userId, data) {
  fs.writeFileSync(getUserFile(userId), JSON.stringify(data, null, 2));
}

// Trim history and keep top-priority tasks only
function trimUserData(userData) {
  const maxHistory = 100;
  if (userData.history.length > maxHistory) {
    userData.history = userData.history.slice(-maxHistory);
  }
  // Keep only top 50 tasks by priority
  if (userData.tasks.length > 50) {
    userData.tasks.sort((a, b) => b.priority - a.priority);
    userData.tasks = userData.tasks.slice(0, 50);
  }
  // Remove past reminders older than 7 days
  const now = new Date();
  userData.reminders = userData.reminders.filter(r => {
    const rDate = new Date(r.when);
    return (now - rDate) / (1000 * 60 * 60 * 24) < 7;
  });
}

// ====== Gemini API Helpers ======
async function callGemini(contents) {
  const payload = { contents };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function classifyMessage(history) {
  const prompt = {
    role: 'user',
    parts: [{ text: `Based on the conversation history, output a JSON with fields: intent (one of habit_log, reminder_set, journal_entry, emotion_check, task_add, task_view, task_clear, clear_data, chat), category, and confidence as a decimal between 0 and 1.` }]
  };
  const reply = await callGemini([prompt]);
  try {
    return JSON.parse(reply);
  } catch {
    return { intent: 'chat', category: 'general', confidence: 0.5 };
  }
}

async function validateIntent(intent, category, text, userData) {
  const errors = [];
  if (intent === 'habit_log' && category === 'habit') {
    const match = text.match(/(\d+)\s*(\w+)/);
    if (!match) errors.push('I need a number and habit name, e.g., "Did 15 pushups".');
  }
  if (intent === 'reminder_set' && category === 'reminder') {
    const dateMatch = text.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/) || text.match(/\b(tomorrow|today|in \d+ days)\b/i) || text.match(/\b(\d{1,2}(AM|PM|am|pm))\b/);
    if (!dateMatch) errors.push('Please specify a valid time/date for the reminder.');
  }
  if (intent === 'task_add' && category === 'task') {
    if (text.length < 3) errors.push('Task description too short.');
  }
  if (intent === 'task_view' && category === 'task') {
    // no validation needed
  }
  if (intent === 'task_clear' && category === 'task') {
    // no validation needed
  }
  return errors;
}

// ====== Handlers ======
async function habitLogger(userData, userMsg) {
  const match = userMsg.match(/(\d+)\s*(\w+)/);
  if (!match) return 'Could not parse the habit entry. Use: Did 15 pushups.';
  const count = parseInt(match[1]);
  const habit = match[2].toLowerCase();
  const today = new Date().toISOString().split('T')[0];
  if (!userData.context.habits[habit]) userData.context.habits[habit] = [];
  userData.context.habits[habit].push({ date: today, count });
  return `Logged ${count} ${habit} for ${today} 👍`;
}

async function reminderHandler(userData, userMsg) {
  // parse date/time
  let whenText = '';
  const explicitDate = userMsg.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
  if (explicitDate) {
    whenText = explicitDate[1];
  } else if (/tomorrow/i.test(userMsg)) {
    const date = new Date(); date.setDate(date.getDate() + 1);
    whenText = date.toISOString().split('T')[0];
  } else {
    const timeMatch = userMsg.match(/(\d{1,2})(AM|PM|am|pm)/);
    if (timeMatch) whenText = `${timeMatch[1]}${timeMatch[2]}`;
  }
  if (!whenText) return 'Could not detect a valid date/time. Please specify.';
  // determine priority via Gemini: high if contains "urgent", else medium
  const priorityText = /urgent|important/i.test(userMsg) ? 3 : 2;
  userData.reminders.push({ text: userMsg, when: whenText, priority: priorityText });
  return `Reminder set: "${userMsg}" at ${whenText} (priority ${priorityText}).`;
}

async function journalHandler(userData, userMsg) {
  const today = new Date().toISOString().split('T')[0];
  if (!userData.context.journal[today]) userData.context.journal[today] = [];
  userData.context.journal[today].push(userMsg);
  return 'Added to journal entry for today.';
}

async function moodAnalyzer(userData, userMsg) {
  const prompt = {
    role: 'user',
    parts: [{ text: `Analyze this text and return only the mood label as plain text (e.g., happy, sad, anxious).` }]
  };
  const mood = await callGemini([...userData.history, { role: 'user', parts: [{ text: userMsg }] }, prompt]);
  const today = new Date().toISOString().split('T')[0];
  userData.moods.push({ date: today, mood });
  userData.context.mood_today = mood;
  return `Logged your mood as "${mood}" for ${today}.`;
}

async function taskAddHandler(userData, userMsg) {
  // parse optional priority
  let priority = 2; // default medium
  if (/high priority/i.test(userMsg)) priority = 3;
  if (/low priority/i.test(userMsg)) priority = 1;
  const taskText = userMsg.replace(/add task|high priority|low priority|medium priority/gi, '').trim();
  const dateCreated = new Date().toISOString();
  userData.tasks.push({ text: taskText, priority, dateCreated });
  return `Task added: "${taskText}" with priority ${priority}.`;
}

async function taskViewHandler(userData) {
  if (!userData.tasks.length) return 'You have no tasks.';
  // sort by priority then date
  const sorted = userData.tasks.sort((a, b) => b.priority - a.priority || new Date(a.dateCreated) - new Date(b.dateCreated));
  let reply = 'Here are your tasks:\n';
  sorted.forEach((t, i) => {
    reply += `${i + 1}. [P${t.priority}] ${t.text}\n`;
  });
  return reply;
}

async function taskClearHandler(userData, userMsg) {
  if (/all/i.test(userMsg)) {
    userData.tasks = [];
    return 'All tasks cleared.';
  }
  const match = userMsg.match(/\d+/);
  if (match) {
    const idx = parseInt(match[0], 10) - 1;
    if (idx >= 0 && idx < userData.tasks.length) {
      const removed = userData.tasks.splice(idx, 1);
      return `Removed task: "${removed[0].text}".`;
    }
  }
  return 'Please specify which task number to remove (e.g., "clear task 2") or "clear all".';
}

async function clearDataHandler(userData) {
  userData.history = [];
  userData.context = { habits: {}, journal: {}, mood_today: null };
  userData.tasks = [];
  userData.reminders = [];
  userData.moods = [];
  return 'All your data has been cleared.';
}

async function aiCompanion(userData, userMsg) {
  const reply = await callGemini([...userData.history, { role: 'user', parts: [{ text: userMsg }] }]);
  return reply;
}

// ====== Core Message Processor ======
async function processMessage(userId, userMsg) {
  const userData = loadUserData(userId);
  userData.history.push({ role: 'user', parts: [{ text: userMsg }] });

  // Classify intent using Gemini
  const classification = await classifyMessage(userData.history);
  console.log(classification)
  const { intent, category } = classification;

  // Validate
  const validationErrors = await validateIntent(intent, category, userMsg, userData);
  if (validationErrors.length) {
    const errMsg = validationErrors.join(' ');
    userData.history.push({ role: 'model', parts: [{ text: errMsg }] });
    saveUserData(userId, userData);
    return errMsg;
  }

  // Route handling
  let botReply;
  switch (intent) {
    case 'habit_log':
      botReply = await habitLogger(userData, userMsg);
      break;
    case 'reminder_set':
      botReply = await reminderHandler(userData, userMsg);
      break;
    case 'journal_entry':
      botReply = await journalHandler(userData, userMsg);
      break;
    case 'emotion_check':
      botReply = await moodAnalyzer(userData, userMsg);
      break;
    case 'task_add':
      botReply = await taskAddHandler(userData, userMsg);
      break;
    case 'task_view':
      botReply = await taskViewHandler(userData);
      break;
    case 'task_clear':
      botReply = await taskClearHandler(userData, userMsg);
      break;
    case 'clear_data':
      botReply = await clearDataHandler(userData);
      break;
    case 'chat':
    default:
      botReply = await aiCompanion(userData, userMsg);
      break;
  }

  userData.history.push({ role: 'model', parts: [{ text: botReply }] });
  trimUserData(userData);
  saveUserData(userId, userData);

  return botReply;
}

// ====== WhatsApp Client Setup ======
const client = new Client({ authStrategy: new LocalAuth(), puppeteer: { headless: true } });

client.on('qr', qr => { qrcode.generate(qr, { small: true }); console.log('Scan the QR code to login'); });
client.on('ready', () => { console.log('✅ Gemini WhatsApp Bot is online'); });

client.on('message', async msg => {
  const userId = msg.from;
  const userMsg = msg.body.trim();
  if (msg.isGroupMsg || msg.fromMe || !userMsg) return;

  console.log(`[${userId}]: ${userMsg}`);
  const reply = await processMessage(userId, userMsg);
  await client.sendMessage(userId, reply);
});

client.initialize();

// ====== HTTP Server for Health Check ======
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🟢 Gemini WhatsApp Bot is running');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}).listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
