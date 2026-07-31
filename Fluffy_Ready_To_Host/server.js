/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║        Fluffy Doghy 🐶  —  Game Server  v4.0                ║
 * ║  Auth · Profiles · Friends · Mailbox · Levels · Owner       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Auth:       Gmail OTP (verified) or username+password (basic)
 * Owner:      sonuubhagat11@gmail.com — post updates, rate levels, ban
 * Levels:     publish, play, rate, featured (owner) → 50 bones on complete
 * Social:     profiles, friends, mailbox (DM + broadcasts)
 * Real-time:  Socket.io (player state) + SSE (chat + updates)
 *
 * Run:  node server.js
 * Game: http://localhost:3000
 */

require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const fs         = require('fs');
const path       = require('path');
const cors       = require('cors');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');

// ── Constants ───────────────────────────────────────────────────────────────
const OWNER_EMAIL    = process.env.OWNER_EMAIL || 'sonuubhagat11@gmail.com';
const PORT           = process.env.PORT || 3000;
const OTP_EXPIRE_MS  = 10 * 60 * 1000; // 10 minutes
const BONES_NORMAL   = 10;
const BONES_FEATURED = 50;

// ── App setup ────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

// ── Nodemailer setup ─────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: { rejectUnauthorized: false }
});

// ── Persistent JSON storage ──────────────────────────────────────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const LEVELS_FILE   = path.join(DATA_DIR, 'levels.json');
const LB_FILE       = path.join(DATA_DIR, 'leaderboard.json');
const CHAT_FILE     = path.join(DATA_DIR, 'chat.json');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const FRIENDS_FILE  = path.join(DATA_DIR, 'friends.json');
const MAIL_FILE     = path.join(DATA_DIR, 'mail.json');
const UPDATES_FILE  = path.join(DATA_DIR, 'updates.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) { console.error('Write error', e); }
}

// ── In-memory state ──────────────────────────────────────────────────────────
let levels      = readJSON(LEVELS_FILE, []);
let leaderboard = readJSON(LB_FILE, []);
let chatHistory = readJSON(CHAT_FILE, []).slice(-80);
let users       = readJSON(USERS_FILE, {});
let friends     = readJSON(FRIENDS_FILE, {});
let mailbox     = readJSON(MAIL_FILE, []);
let updates     = readJSON(UPDATES_FILE, []);

const players   = {};     // socket.id → playerState
const chatSubs  = new Set();
const updateSubs = new Set();

// OTP store: email → { code, expires }
const otpStore  = {};

// ── Content Moderation ────────────────────────────────────────────────────────

// Bad words list (censored in display)
const BAD_WORDS = [
  'fuck','shit','bitch','asshole','cunt','dick','pussy','bastard','damn','ass',
  'nigger','nigga','faggot','retard','whore','slut','prick','cock','twat','wanker'
];

// 🚨 Grooming / predator red-flag patterns — auto-alert owner
const GROOMING_PATTERNS = [
  /how old are you/i, /how old r u/i, /asl\b/i,
  /are you alone/i, /r u alone/i,
  /send me (a )?(pic|photo|picture|video|vid)/i,
  /send (pic|photo|picture|video|vid)/i,
  /snap(chat)?/i, /instagram|discord|whatsapp|telegram/i,
  /meet (me|up|irl)/i, /meet in (person|real life)/i,
  /don.t tell (your )?(parents|mom|dad|anyone)/i,
  /keep (this |it )?secret/i,
  /you.re (so )?(cute|pretty|hot|sexy|beautiful) for your age/i,
  /how big|how small/i,
  /take off|undress|naked|nude/i,
  /touch yourself/i, /masturbat/i,
  /i love you\b.{0,20}old/i,
  /private (place|meeting|talk)/i,
  /want to be my (girlfriend|boyfriend|gf|bf)/i,
  /no one has to know/i,
  /special friend/i,
];

// Rate limiting: username → { count, windowStart }
const msgRateMap = {};
const MSG_LIMIT    = 6;   // max messages
const MSG_WINDOW   = 5000; // per 5 seconds

// Strike system: username → strike count (3 = auto-ban)
const strikes = {};

// ── Moderation Helpers ────────────────────────────────────────────────────────

function uid() { return crypto.randomBytes(8).toString('hex'); }

/** Replace bad words with asterisks */
function filterProfanity(text) {
  let out = text;
  for (const w of BAD_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, 'gi');
    out = out.replace(re, '*'.repeat(w.length));
  }
  return out;
}

/** Returns true if text contains bad words */
function hasProfanity(text) {
  return BAD_WORDS.some(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
}

/** Returns matched grooming pattern or null */
function detectGrooming(text) {
  for (const p of GROOMING_PATTERNS) {
    if (p.test(text)) return p.source;
  }
  return null;
}

/** Validate username — no bad words, reasonable chars */
function validateUsername(name) {
  if (!name || name.length < 2 || name.length > 24) return 'Username must be 2–24 characters';
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(name)) return 'Username can only contain letters, numbers, spaces, _ - .';
  if (hasProfanity(name)) return 'Username contains inappropriate words';
  return null; // ok
}

/** Rate-limit check: returns true if user is sending too fast */
function isRateLimited(usernameKey) {
  const now = Date.now();
  if (!msgRateMap[usernameKey]) msgRateMap[usernameKey] = { count: 0, windowStart: now };
  const r = msgRateMap[usernameKey];
  if (now - r.windowStart > MSG_WINDOW) { r.count = 0; r.windowStart = now; }
  r.count++;
  return r.count > MSG_LIMIT;
}

/** Issue a strike — auto-ban at 3 */
function issueStrike(usernameKey, reason) {
  if (!strikes[usernameKey]) strikes[usernameKey] = 0;
  strikes[usernameKey]++;
  const count = strikes[usernameKey];
  console.warn(`⚠️  Strike ${count}/3 for ${usernameKey}: ${reason}`);
  if (count >= 3) {
    const u = users[usernameKey];
    if (u && u.role !== 'owner') {
      u.banned = true;
      u.banReason = `Auto-banned after 3 strikes: ${reason}`;
      u.token = null;
      writeJSON(USERS_FILE, users);
      // Kick from all sockets
      for (const [sid, p] of Object.entries(players)) {
        if (p.username?.toLowerCase() === usernameKey) {
          io.to(sid).emit('banned', { reason: u.banReason });
        }
      }
      alertOwner(`🔨 AUTO-BAN: ${usernameKey}`, `Auto-banned after 3 strikes.\nLast reason: ${reason}`);
      return true; // banned
    }
  }
  return false;
}

/** Alert the owner via mailbox + email + socket */
function alertOwner(subject, body) {
  const ownerEntry = Object.entries(users).find(([, u]) => u.role === 'owner');
  if (!ownerEntry) return;
  const [ownerKey] = ownerEntry;
  const msg = { id: uid(), from: 'system', to: ownerKey, subject, body, ts: Date.now(), read: false, type: 'alert' };
  mailbox.push(msg);
  writeJSON(MAIL_FILE, mailbox);
  for (const [sid, p] of Object.entries(players)) {
    if (p.username?.toLowerCase() === ownerKey) {
      io.to(sid).emit('ownerAlert', { subject, body });
    }
  }
  sendMail(OWNER_EMAIL, `🐶 Fluffy Alert: ${subject}`, `<pre style="white-space:pre-wrap;font-family:monospace;">${body}</pre>`).catch(() => {});
}

/** Full message scan: filter + grooming detect + rate limit */
function moderateMessage(text, usernameKey) {
  // 1. Rate limit
  if (isRateLimited(usernameKey)) {
    return { blocked: true, reason: 'rate_limit', filtered: text };
  }
  // 2. Grooming pattern check — BLOCK + ALERT immediately
  const groomMatch = detectGrooming(text);
  if (groomMatch) {
    const u = users[usernameKey];
    const displayName = u?.displayName || usernameKey;
    alertOwner(
      `🚨 Grooming Pattern Detected: ${displayName}`,
      `Player: ${displayName}\nMessage: "${text}"\nPattern matched: ${groomMatch}\nTime: ${new Date().toISOString()}`
    );
    issueStrike(usernameKey, `grooming pattern: ${groomMatch}`);
    return { blocked: true, reason: 'grooming', filtered: text };
  }
  // 3. Profanity — filter but allow (with strike after 2 offences)
  const filtered = filterProfanity(text);
  if (filtered !== text) {
    if (!strikes[usernameKey]) strikes[usernameKey] = 0;
    // Only strike on repeated profanity (not first offence — just filter it)
  }
  return { blocked: false, filtered };
}

// ── 🆘 Emergency Detection System ────────────────────────────────────────────
// Detects messages indicating real-world danger: assault, kidnapping, death threats

const EMERGENCY_PATTERNS = [
  // Physical assault / violence
  /he.s (hitting|beating|hurting|attacking) me/i,
  /she.s (hitting|beating|hurting|attacking) me/i,
  /they.re (hitting|beating|hurting|attacking) me/i,
  /i.m being (hit|beaten|hurt|attacked|abused|assaulted)/i,
  /i got (hit|beaten|hurt|attacked|assaulted)/i,
  /someone (hit|attacked|hurt|assaulted) me/i,
  /i.m (bleeding|injured|wounded)/i,
  /help me (please|someone|anybody|now)/i,
  /please help me/i,
  /i need help (now|please|fast|quickly|urgently)/i,
  /call (the )?(police|cops|911|100|999|112)/i,
  // Kidnapping
  /i.ve been (taken|kidnapped|abducted)/i,
  /i am (kidnapped|abducted|trapped|locked)/i,
  /someone (took|kidnapped|abducted|grabbed) me/i,
  /i.m trapped/i,
  /i can.t (leave|escape|get out|get away)/i,
  /he.s not letting me (leave|go|escape)/i,
  /she.s not letting me (leave|go|escape)/i,
  /they.re not letting me (leave|go|escape)/i,
  /i.m being held/i,
  /help i.m (locked|trapped|stuck) (in|at)/i,
  // Death / suicide
  /i.m going to (die|be killed|get killed)/i,
  /i think i.m dying/i,
  /someone (died|was killed|got killed)/i,
  /my (friend|sister|brother|mom|dad|parent) (died|was killed|got killed|is dead)/i,
  /i want to (kill myself|die|end it)/i,
  /i.m going to (kill myself|end my life|commit suicide)/i,
  /i don.t want to live/i,
  /goodbye (forever|everyone|world)/i,
  /this is my (last|final) (message|goodbye|words)/i,
  // Threats from others
  /he.s going to (kill|hurt) me/i,
  /she.s going to (kill|hurt) me/i,
  /they.re going to (kill|hurt) me/i,
  /someone threatened (to kill|to hurt) me/i,
  /i received a (death threat|threat)/i,
  // Abuse
  /i.m being (abused|molested|raped|touched)/i,
  /he (touched|molested|raped|abused) me/i,
  /she (touched|molested|raped|abused) me/i,
  /sexual(ly)? (abused|assaulted|harassed)/i,
];

/** Check for emergency signals and fire an URGENT alert to owner */
function checkEmergency(text, usernameKey, context) {
  for (const p of EMERGENCY_PATTERNS) {
    if (p.test(text)) {
      const u = users[usernameKey];
      const displayName = u?.displayName || usernameKey;
      const subject = `🆘 EMERGENCY ALERT — ${displayName}`;
      const body = [
        `⚠️  URGENT: A player on Fluffy Doghy may be in REAL DANGER.`,
        ``,
        `Player username : ${displayName}`,
        `Context        : ${context}`,
        `Message        : "${text}"`,
        `Pattern matched: ${p.source}`,
        `Time           : ${new Date().toISOString()}`,
        ``,
        `ACTION REQUIRED:`,
        `  1. Check if this player is still online`,
        `  2. Attempt to contact them via in-game Mailbox`,
        `  3. If serious — contact local police with this report`,
        ``,
        `This alert was generated automatically by Fluffy Doghy safety systems.`,
      ].join('\n');

      // In-game mailbox + socket alert
      const ownerEntry = Object.entries(users).find(([, u]) => u.role === 'owner');
      if (ownerEntry) {
        const [ownerKey] = ownerEntry;
        mailbox.push({ id: uid(), from: 'system', to: ownerKey, subject, body, ts: Date.now(), read: false, type: 'emergency' });
        writeJSON(MAIL_FILE, mailbox);
        for (const [sid, p2] of Object.entries(players)) {
          if (p2.username?.toLowerCase() === ownerKey) {
            io.to(sid).emit('emergencyAlert', { player: displayName, message: text, pattern: p.source });
          }
        }
      }

      // Send URGENT email with high priority headers
      sendMail(
        OWNER_EMAIL,
        `🆘 EMERGENCY — Fluffy Player May Be In Danger: ${displayName}`,
        `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;background:#1a0000;color:#fff;border-radius:12px;border:2px solid #f87171;">
          <h2 style="color:#f87171;margin-top:0;">🆘 EMERGENCY ALERT</h2>
          <p style="color:#fca5a5;font-size:16px;"><strong>A player on Fluffy Doghy may be in real danger.</strong></p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:6px;color:#888;">Player</td><td style="padding:6px;color:#fff;font-weight:bold;">${displayName}</td></tr>
            <tr><td style="padding:6px;color:#888;">Message</td><td style="padding:6px;color:#fca5a5;">"${text}"</td></tr>
            <tr><td style="padding:6px;color:#888;">Context</td><td style="padding:6px;color:#fff;">${context}</td></tr>
            <tr><td style="padding:6px;color:#888;">Time</td><td style="padding:6px;color:#fff;">${new Date().toLocaleString()}</td></tr>
          </table>
          <div style="background:#2d0000;border-left:4px solid #f87171;padding:12px;border-radius:4px;">
            <strong style="color:#f87171;">⚖️ If this is a real emergency:</strong><br>
            <span style="color:#fca5a5;">Contact local police and provide this report. CHILDLINE India: 1098</span>
          </div>
        </div>
        `
      ).catch(e => console.error('Emergency email failed:', e.message));

      console.error(`\n🆘 EMERGENCY DETECTED — Player: ${displayName} — "${text}"\n`);
      return true; // emergency detected
    }
  }
  return false;
}


function getUser(username) {
  return username ? users[username.toLowerCase()] : null;
}

function requireAuth(req, res, next) {
  const { username, token } = req.headers;
  if (!username || !token) return res.status(401).json({ error: 'Not authenticated' });
  const u = getUser(username);
  if (!u || u.token !== token) return res.status(401).json({ error: 'Invalid session' });
  if (u.banned) return res.status(403).json({ error: 'Account banned' });
  req.user = u;
  req.userKey = username.toLowerCase();
  next();
}

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    next();
  });
}

function broadcastSSE(subs, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch {}
  }
}

function broadcastChat(msg) {
  broadcastSSE(chatSubs, { type: 'message', message: msg });
}

function broadcastChatCount() {
  broadcastSSE(chatSubs, { type: 'count', count: chatSubs.size });
}

function broadcastUpdate(upd) {
  broadcastSSE(updateSubs, { type: 'update', update: upd });
}

function systemMsg(text) {
  const msg = { username: 'System', text, ts: Date.now() };
  chatHistory.push(msg);
  if (chatHistory.length > 80) chatHistory.shift();
  writeJSON(CHAT_FILE, chatHistory);
  broadcastChat(msg);
}

function sendMail(to, subject, html) {
  return mailer.sendMail({
    from: `"Fluffy Doghy 🐶" <${process.env.GMAIL_USER}>`,
    to, subject, html
  });
}

// ── Auth: OTP ────────────────────────────────────────────────────────────────
app.post('/auth/send-otp', async (req, res) => {
  const { email, username } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!username) return res.status(400).json({ error: 'Username required' });

  const key = username.toLowerCase();
  const lowerEmail = email.toLowerCase();
  const existingUser = users[key];

  // Prevent hijacking an existing account that already has an email
  if (existingUser && existingUser.email && existingUser.email !== lowerEmail) {
    return res.status(400).json({ error: 'Username is registered to a different email' });
  }

  // Prevent multiple accounts using the same email
  const emailUser = Object.values(users).find(u => u.email === lowerEmail);
  if (emailUser && emailUser.displayName.toLowerCase() !== key) {
    return res.status(400).json({ error: 'Email is already registered to another account' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore[email.toLowerCase()] = { code, expires: Date.now() + OTP_EXPIRE_MS };

  try {
    await sendMail(email, '🐶 Your Fluffy Doghy Login Code', `
      <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#0d0d1a;color:#fff;border-radius:16px;">
        <h2 style="color:#a78bfa;">🐶 Fluffy Doghy</h2>
        <p>Your one-time login code is:</p>
        <div style="font-size:40px;font-weight:bold;letter-spacing:8px;color:#c4b5fd;text-align:center;padding:16px;background:#1a1a2e;border-radius:8px;">
          ${code}
        </div>
        <p style="color:#888;font-size:12px;margin-top:16px;">Expires in 10 minutes. Don't share this code.</p>
      </div>
    `);
    res.json({ ok: true, message: 'OTP sent to ' + email });
  } catch (e) {
    console.error('Mail error:', e.message);
    res.status(500).json({ error: 'Could not send email. Check GMAIL_APP_PASSWORD in .env' });
  }
});

app.post('/auth/verify-otp', (req, res) => {
  const { email, code, username } = req.body;
  if (!email || !code || !username) return res.status(400).json({ error: 'email, code, and username required' });

  const entry = otpStore[email.toLowerCase()];
  if (!entry || entry.code !== String(code)) return res.status(401).json({ error: 'Invalid or expired OTP' });
  if (Date.now() > entry.expires) {
    delete otpStore[email.toLowerCase()];
    return res.status(401).json({ error: 'OTP expired' });
  }
  delete otpStore[email.toLowerCase()];

  const key = username.toLowerCase();
  const isOwner = email.toLowerCase() === OWNER_EMAIL.toLowerCase();
  const token = uid();

  if (!users[key]) {
    users[key] = {
      displayName: username, email: email.toLowerCase(), password: null,
      role: isOwner ? 'owner' : 'player', verified: true,
      bones: 0, bio: '', skin: 'base',
      created: Date.now(), banned: false, completedLevels: [], token
    };
  } else {
    // Existing user — upgrade with verified email and owner if applicable
    users[key].email     = email.toLowerCase();
    users[key].verified  = true;
    users[key].token     = token;
    if (isOwner) users[key].role = 'owner';
  }

  writeJSON(USERS_FILE, users);
  res.json({
    ok: true,
    username: users[key].displayName,
    token,
    role: users[key].role,
    verified: true,
    bones: users[key].bones
  });
});

// ── Auth: Password ───────────────────────────────────────────────────────────
app.post('/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 4)
    return res.status(400).json({ error: 'Username (3+) and password (4+) required' });
  const key = username.toLowerCase();
  if (users[key]) return res.status(409).json({ error: 'Username taken' });

  const token = uid();
  users[key] = {
    displayName: username, email: null, password,
    role: 'player', verified: false,
    bones: 0, bio: '', skin: 'base',
    created: Date.now(), banned: false, completedLevels: [], token
  };
  writeJSON(USERS_FILE, users);
  res.json({ ok: true, username, token, role: 'player', verified: false, bones: 0 });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const key = username.toLowerCase();
  const u = users[key];
  if (!u) return res.status(404).json({ error: 'Account not found' });
  if (u.banned) return res.status(403).json({ error: 'Account banned. Contact owner.' });
  if (u.password !== password) return res.status(401).json({ error: 'Wrong password' });

  const token = uid();
  u.token = token;
  writeJSON(USERS_FILE, users);
  res.json({ ok: true, username: u.displayName, token, role: u.role, verified: u.verified, bones: u.bones });
});

// Legacy login (keep backward compat)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const key = username.toLowerCase();
  if (users[key]) {
    if (users[key].banned) return res.status(403).json({ error: 'Account banned' });
    if (users[key].password !== password)
      return res.status(401).json({ error: 'Invalid password' });
    return res.json({ success: true, message: 'Logged in', username: users[key].displayName });
  }
  users[key] = {
    displayName: username, email: null, password,
    role: 'player', verified: false,
    bones: 0, bio: '', skin: 'base',
    created: Date.now(), banned: false, completedLevels: [], token: uid()
  };
  writeJSON(USERS_FILE, users);
  return res.json({ success: true, message: 'Account created', username });
});

// ── Player Profiles ──────────────────────────────────────────────────────────
app.get('/api/profile/:username', (req, res) => {
  const u = getUser(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const key = req.params.username.toLowerCase();
  const friendCount = (friends[key]?.friends || []).length;
  res.json({
    username:       u.displayName,
    role:           u.role,
    verified:       u.verified,
    bones:          u.bones,
    bio:            u.bio || '',
    skin:           u.skin || 'base',
    created:        u.created,
    friendCount,
    completedCount: (u.completedLevels || []).length,
    banned:         u.banned || false
  });
});

app.post('/api/profile/update', requireAuth, (req, res) => {
  const { bio, skin } = req.body;
  if (bio !== undefined) req.user.bio = String(bio).slice(0, 200);
  if (skin !== undefined) req.user.skin = String(skin).slice(0, 32);
  writeJSON(USERS_FILE, users);
  res.json({ ok: true });
});

// ── Friends ──────────────────────────────────────────────────────────────────
function ensureFriendRecord(key) {
  if (!friends[key]) friends[key] = { friends: [], requests: [] };
}

app.get('/api/friends/:username', (req, res) => {
  const key = req.params.username.toLowerCase();
  ensureFriendRecord(key);
  res.json({ friends: friends[key].friends, requests: friends[key].requests });
});

app.post('/api/friends/request', requireAuth, (req, res) => {
  const { target } = req.body;
  if (!target) return res.status(400).json({ error: 'target required' });
  const tKey = target.toLowerCase();
  const sKey = req.userKey;
  if (!getUser(tKey)) return res.status(404).json({ error: 'User not found' });
  if (tKey === sKey) return res.status(400).json({ error: 'Cannot friend yourself' });
  ensureFriendRecord(tKey);
  ensureFriendRecord(sKey);
  if (friends[tKey].friends.includes(sKey)) return res.json({ ok: true, message: 'Already friends' });
  if (!friends[tKey].requests.includes(sKey)) friends[tKey].requests.push(sKey);
  writeJSON(FRIENDS_FILE, friends);
  // Mail notification
  mailbox.push({ id: uid(), from: 'System', to: tKey, subject: '🐾 Friend Request', body: `${req.user.displayName} sent you a friend request!`, ts: Date.now(), read: false });
  writeJSON(MAIL_FILE, mailbox);
  res.json({ ok: true });
});

app.post('/api/friends/accept', requireAuth, (req, res) => {
  const { from } = req.body;
  const fKey = from?.toLowerCase();
  const myKey = req.userKey;
  ensureFriendRecord(myKey);
  ensureFriendRecord(fKey);
  friends[myKey].requests = friends[myKey].requests.filter(r => r !== fKey);
  if (!friends[myKey].friends.includes(fKey)) friends[myKey].friends.push(fKey);
  if (!friends[fKey].friends.includes(myKey)) friends[fKey].friends.push(myKey);
  writeJSON(FRIENDS_FILE, friends);
  res.json({ ok: true });
});

app.post('/api/friends/remove', requireAuth, (req, res) => {
  const { target } = req.body;
  const tKey = target?.toLowerCase();
  const myKey = req.userKey;
  ensureFriendRecord(myKey);
  ensureFriendRecord(tKey);
  friends[myKey].friends = friends[myKey].friends.filter(f => f !== tKey);
  friends[tKey].friends  = friends[tKey].friends.filter(f => f !== myKey);
  writeJSON(FRIENDS_FILE, friends);
  res.json({ ok: true });
});

// ── Mailbox ──────────────────────────────────────────────────────────────────
app.get('/api/mail', requireAuth, (req, res) => {
  const inbox = mailbox.filter(m => m.to === req.userKey).sort((a, b) => b.ts - a.ts).slice(0, 50);
  res.json({ mail: inbox });
});

app.post('/api/mail/send', requireAuth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Only the game owner can send mail.' });
  const { to, subject, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'to and body required' });
  const toKey = to.toLowerCase();
  if (!getUser(toKey)) return res.status(404).json({ error: 'Recipient not found' });
  const msg = { id: uid(), from: req.userKey, to: toKey, subject: subject || 'No Subject', body: String(body).slice(0, 1000), ts: Date.now(), read: false };
  mailbox.push(msg);
  if (mailbox.length > 2000) mailbox = mailbox.slice(-2000);
  writeJSON(MAIL_FILE, mailbox);
  res.json({ ok: true });
});

app.post('/api/mail/read/:id', requireAuth, (req, res) => {
  const msg = mailbox.find(m => m.id === req.params.id && m.to === req.userKey);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  msg.read = true;
  writeJSON(MAIL_FILE, mailbox);
  res.json({ ok: true });
});

app.delete('/api/mail/:id', requireAuth, (req, res) => {
  mailbox = mailbox.filter(m => !(m.id === req.params.id && m.to === req.userKey));
  writeJSON(MAIL_FILE, mailbox);
  res.json({ ok: true });
});

// Get private DM thread between two users
app.get('/api/mail/thread/:withUsername', requireAuth, (req, res) => {
  const myKey   = req.userKey;
  const withKey = req.params.withUsername.toLowerCase();
  if (!getUser(withKey)) return res.status(404).json({ error: 'User not found' });
  // Only allow if they are friends
  const myFriends = friends[myKey]?.friends || [];
  if (!myFriends.includes(withKey) && req.user.role !== 'owner')
    return res.status(403).json({ error: 'You must be friends to read private messages' });
  const thread = mailbox
    .filter(m => (m.from === myKey && m.to === withKey) || (m.from === withKey && m.to === myKey))
    .sort((a, b) => a.ts - b.ts)
    .slice(-100);
  res.json({ thread });
});

// ── Safety Report ─────────────────────────────────────────────────────────────
app.post('/api/report', requireAuth, (req, res) => {
  const { reportedUsername, reason, evidence } = req.body;
  if (!reportedUsername || !reason) return res.status(400).json({ error: 'reportedUsername and reason required' });
  const ownerKey = OWNER_EMAIL.split('@')[0].toLowerCase();
  // Find owner account
  const ownerEntry = Object.entries(users).find(([, u]) => u.role === 'owner');
  if (!ownerEntry) return res.status(500).json({ error: 'No owner account exists yet' });
  const [ownerAccountKey] = ownerEntry;
  const reportBody = [
    `🚨 SAFETY REPORT from: ${req.user.displayName}`,
    `Reported player: ${reportedUsername}`,
    `Reason: ${reason}`,
    evidence ? `Evidence / messages:\n${String(evidence).slice(0, 2000)}` : '(No evidence provided)',
    `Submitted: ${new Date().toISOString()}`
  ].join('\n\n');
  const reportMsg = {
    id: uid(), from: req.userKey, to: ownerAccountKey,
    subject: `🚨 Safety Report: ${reportedUsername}`,
    body: reportBody,
    ts: Date.now(), read: false, type: 'safety_report'
  };
  mailbox.push(reportMsg);
  writeJSON(MAIL_FILE, mailbox);
  // Also send real-time notification to owner if online
  for (const [sid, p] of Object.entries(players)) {
    if (p.username?.toLowerCase() === ownerAccountKey) {
      io.to(sid).emit('safetyReport', { from: req.user.displayName, reported: reportedUsername });
    }
  }
  // Try to also email the owner
  sendMail(OWNER_EMAIL, `🚨 Fluffy Safety Report: ${reportedUsername}`, `<pre style="font-family:monospace;white-space:pre-wrap;">${reportBody}</pre>`).catch(() => {});
  res.json({ ok: true, message: 'Report submitted to the owner. Thank you for keeping the community safe.' });
});

// ── Owner: Hack Account ────────────────────────────────────────────────────────
app.get('/api/owner/hack/:username', requireOwner, (req, res) => {
  const target = req.params.username.toLowerCase();
  const u = users[target];
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.role === 'owner') return res.status(400).json({ error: 'Cannot hack another owner' });
  
  res.json({ ok: true, token: u.token, username: u.displayName, role: u.role });
});

// ── Owner: Broadcast Mail ─────────────────────────────────────────────────────
app.post('/api/owner/broadcast-mail', requireOwner, (req, res) => {
  const { subject, body } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });
  const msgs = Object.keys(users).map(key => ({
    id: uid(), from: 'owner', to: key, subject: subject || '📢 Announcement', body: String(body).slice(0, 1000), ts: Date.now(), read: false
  }));
  mailbox.push(...msgs);
  if (mailbox.length > 5000) mailbox = mailbox.slice(-5000);
  writeJSON(MAIL_FILE, mailbox);
  res.json({ ok: true, sent: msgs.length });
});

// ── Community Levels ─────────────────────────────────────────────────────────
app.get('/api/levels', (req, res) => {
  const sorted = [...levels].sort((a, b) => (b.ratings || 0) - (a.ratings || 0));
  res.json({ levels: sorted.slice(0, 50) });
});

app.get('/api/levels/:id', (req, res) => {
  const lvl = levels.find(l => l.id === req.params.id);
  if (!lvl) return res.status(404).json({ error: 'Level not found' });
  res.json({ level: lvl });
});

app.post('/api/levels/upload', (req, res) => {
  const lvl = req.body;
  if (!lvl || !lvl.name || !lvl.map) return res.status(400).json({ error: 'Invalid level data' });
  const idx = levels.findIndex(l => l.name === lvl.name && l.author === lvl.author);
  const entry = {
    id:       lvl.id || ('lvl_' + Date.now()),
    name:     String(lvl.name).slice(0, 60),
    author:   String(lvl.author || 'Anonymous').slice(0, 30),
    map:      lvl.map,
    cols:     lvl.cols || 17,
    rows:     lvl.rows || 12,
    deco:     lvl.deco  || {},
    bright:   lvl.bright || {},
    theme:    lvl.theme  || null,
    gim:      lvl.gim    || '',
    ratings:  idx >= 0 ? levels[idx].ratings : 0, // Legacy support
    likes:    idx >= 0 ? (levels[idx].likes || []) : [],
    dislikes: idx >= 0 ? (levels[idx].dislikes || []) : [],
    featured: idx >= 0 ? (levels[idx].featured || false) : false,
    plays:    idx >= 0 ? (levels[idx].plays || 0) : 0,
    uploaded: Date.now()
  };
  if (idx >= 0) levels[idx] = entry;
  else levels.push(entry);
  writeJSON(LEVELS_FILE, levels);
  systemMsg(`📢 ${entry.author} published a new level: "${entry.name}"!`);
  res.json({ ok: true, id: entry.id });
});

// Like or Dislike a level (GD style)
app.post('/api/levels/rate', requireAuth, (req, res) => {
  const { id, action } = req.body; // action: 'like' or 'dislike'
  if (!id || !['like', 'dislike'].includes(action)) return res.status(400).json({ error: 'Invalid parameters' });
  
  const lvl = levels.find(l => l.id === id);
  if (!lvl) return res.status(404).json({ error: 'Level not found' });
  
  const myKey = req.userKey;
  if (!lvl.likes) lvl.likes = [];
  if (!lvl.dislikes) lvl.dislikes = [];
  
  // Remove existing rating if any
  lvl.likes = lvl.likes.filter(u => u !== myKey);
  lvl.dislikes = lvl.dislikes.filter(u => u !== myKey);
  
  // Apply new rating
  if (action === 'like') lvl.likes.push(myKey);
  if (action === 'dislike') lvl.dislikes.push(myKey);
  
  // Update legacy ratings score (GD style: likes minus dislikes)
  lvl.ratings = lvl.likes.length - lvl.dislikes.length;
  
  writeJSON(LEVELS_FILE, levels);
  res.json({ ok: true, score: lvl.ratings, likes: lvl.likes.length, dislikes: lvl.dislikes.length });
});
// Get paginated comments for a level
app.get('/api/levels/:id/comments', (req, res) => {
  const lvl = levels.find(l => l.id === req.params.id);
  if (!lvl) return res.status(404).json({ error: 'Level not found' });
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 10;
  const comments = (lvl.comments || []).sort((a, b) => b.ts - a.ts);
  const totalPages = Math.ceil(comments.length / limit);
  const start = (page - 1) * limit;
  const paginated = comments.slice(start, start + limit);
  res.json({ comments: paginated, page, totalPages, totalComments: comments.length });
});

// Post a comment on a level
app.post('/api/levels/comment', requireAuth, (req, res) => {
  const { id, text } = req.body;
  if (!id || !text) return res.status(400).json({ error: 'id and text required' });
  const lvl = levels.find(l => l.id === id);
  if (!lvl) return res.status(404).json({ error: 'Level not found' });
  
  const rawText = String(text).slice(0, 300);
  checkEmergency(rawText, req.userKey, `Level Comment on "${lvl.name}"`);
  
  const mod = moderateMessage(rawText, req.userKey);
  if (mod.blocked) return res.status(400).json({ error: 'Comment blocked by moderation system' });
  
  if (!lvl.comments) lvl.comments = [];
  const commentObj = {
    id: uid(),
    username: req.user.displayName,
    text: mod.filtered,
    ts: Date.now(),
    likes: [],
    dislikes: []
  };
  
  lvl.comments.push(commentObj);
  // Allow up to 1000 comments per level now that we have pagination
  if (lvl.comments.length > 1000) lvl.comments.shift(); 
  writeJSON(LEVELS_FILE, levels);
  
  res.json({ ok: true, comment: commentObj });
});

// Like or Dislike a comment
app.post('/api/levels/comment/rate', requireAuth, (req, res) => {
  const { levelId, commentId, action } = req.body; // action: 'like' or 'dislike'
  if (!levelId || !commentId || !['like', 'dislike'].includes(action)) 
    return res.status(400).json({ error: 'Invalid parameters' });
    
  const lvl = levels.find(l => l.id === levelId);
  if (!lvl || !lvl.comments) return res.status(404).json({ error: 'Level/comments not found' });
  
  const comment = lvl.comments.find(c => c.id === commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  
  const myKey = req.userKey;
  if (!comment.likes) comment.likes = [];
  if (!comment.dislikes) comment.dislikes = [];
  
  // Remove existing rating if any
  comment.likes = comment.likes.filter(u => u !== myKey);
  comment.dislikes = comment.dislikes.filter(u => u !== myKey);
  
  // Apply new rating
  if (action === 'like') comment.likes.push(myKey);
  if (action === 'dislike') comment.dislikes.push(myKey);
  
  writeJSON(LEVELS_FILE, levels);
  res.json({ ok: true, likes: comment.likes.length, dislikes: comment.dislikes.length });
});

// Player completed a level → award bones
app.post('/api/levels/complete', requireAuth, (req, res) => {
  const { levelId } = req.body;
  if (!levelId) return res.status(400).json({ error: 'levelId required' });
  const lvl = levels.find(l => l.id === levelId);
  if (!lvl) return res.status(404).json({ error: 'Level not found' });

  lvl.plays = (lvl.plays || 0) + 1;

  const u = req.user;
  if (!u.completedLevels) u.completedLevels = [];
  const firstTime = !u.completedLevels.includes(levelId);
  let bonesAwarded = 0;

  if (firstTime) {
    u.completedLevels.push(levelId);
    bonesAwarded = lvl.featured ? BONES_FEATURED : BONES_NORMAL;
    u.bones = (u.bones || 0) + bonesAwarded;
    // Mail reward notification
    mailbox.push({ id: uid(), from: 'System', to: req.userKey, subject: '🦴 Bones Awarded!', body: `You completed "${lvl.name}" and earned ${bonesAwarded} bones!${lvl.featured ? ' (Featured level bonus!)' : ''}`, ts: Date.now(), read: false });
    writeJSON(MAIL_FILE, mailbox);
  }

  writeJSON(LEVELS_FILE, levels);
  writeJSON(USERS_FILE, users);
  res.json({ ok: true, bonesAwarded, totalBones: u.bones, firstTime });
});

// Owner: mark level as featured
app.post('/api/levels/owner-rate', requireOwner, (req, res) => {
  const { id, featured } = req.body;
  const lvl = levels.find(l => l.id === id);
  if (!lvl) return res.status(404).json({ error: 'Level not found' });
  lvl.featured = featured !== false;
  writeJSON(LEVELS_FILE, levels);
  systemMsg(`⭐ "${lvl.name}" has been ${lvl.featured ? 'featured' : 'unfeatured'} by the owner! (${lvl.featured ? '+50 bones on completion' : 'normal reward'})`);
  res.json({ ok: true, featured: lvl.featured });
});

// Owner: delete a level
app.delete('/api/levels/:id', requireOwner, (req, res) => {
  const before = levels.length;
  levels = levels.filter(l => l.id !== req.params.id);
  if (levels.length === before) return res.status(404).json({ error: 'Level not found' });
  writeJSON(LEVELS_FILE, levels);
  res.json({ ok: true });
});

// ── Owner: Updates / Announcements ───────────────────────────────────────────
app.get('/api/updates', (req, res) => {
  res.json({ updates: [...updates].reverse().slice(0, 20) });
});

app.post('/api/owner/post-update', requireOwner, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  const upd = { id: uid(), title: String(title).slice(0, 100), body: String(body).slice(0, 2000), ts: Date.now() };
  updates.push(upd);
  writeJSON(UPDATES_FILE, updates);
  broadcastUpdate(upd);
  systemMsg(`📣 New update from the owner: "${upd.title}"`);
  res.json({ ok: true, update: upd });
});

// ── Owner: Ban / Unban ────────────────────────────────────────────────────────
app.post('/api/owner/ban', requireOwner, (req, res) => {
  const { username, reason } = req.body;
  const key = username?.toLowerCase();
  if (!key || !users[key]) return res.status(404).json({ error: 'User not found' });
  if (users[key].role === 'owner') return res.status(400).json({ error: 'Cannot ban the owner' });
  users[key].banned = true;
  users[key].banReason = reason || 'Banned by owner';
  users[key].token = null; // invalidate session
  writeJSON(USERS_FILE, users);
  // Kick from socket if online
  for (const [sid, p] of Object.entries(players)) {
    if (p.username?.toLowerCase() === key) {
      io.to(sid).emit('banned', { reason: users[key].banReason });
    }
  }
  systemMsg(`🔨 ${username} has been banned.`);
  res.json({ ok: true });
});

app.post('/api/owner/unban', requireOwner, (req, res) => {
  const { username } = req.body;
  const key = username?.toLowerCase();
  if (!key || !users[key]) return res.status(404).json({ error: 'User not found' });
  users[key].banned = false;
  users[key].banReason = null;
  writeJSON(USERS_FILE, users);
  systemMsg(`✅ ${username} has been unbanned.`);
  res.json({ ok: true });
});

// ── SSE: Live Updates stream ──────────────────────────────────────────────────
app.get('/api/updates/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'history', updates: [...updates].reverse().slice(0, 5) })}\n\n`);
  updateSubs.add(res);
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(hb); updateSubs.delete(res); });
});

// ── SSE: Chat stream ─────────────────────────────────────────────────────────
app.get('/api/chat/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'history', history: chatHistory })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'count', count: chatSubs.size + 1 })}\n\n`);
  chatSubs.add(res);
  broadcastChatCount();
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(hb); chatSubs.delete(res); broadcastChatCount(); });
});

app.post('/api/chat/send', (req, res) => {
  const { username, text } = req.body;
  if (!username || !text || text.length > 200) return res.status(400).json({ error: 'Bad message' });
  const u = getUser(username);
  if (u?.banned) return res.status(403).json({ error: 'Banned' });
  const msg = { username, text: text.slice(0, 200), ts: Date.now(), verified: u?.verified || false, role: u?.role || 'player' };
  chatHistory.push(msg);
  if (chatHistory.length > 80) chatHistory.shift();
  writeJSON(CHAT_FILE, chatHistory);
  broadcastChat(msg);
  res.json({ ok: true });
});

// ── Leaderboard ──────────────────────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
  const sorted = [...leaderboard].sort((a, b) => a.time - b.time);
  res.json({ entries: sorted.slice(0, 100) });
});

app.post('/api/leaderboard/submit', (req, res) => {
  const { username, levelName, time, deaths } = req.body;
  if (!username || !levelName || typeof time !== 'number') return res.status(400).json({ error: 'Bad data' });
  const key = username + '|' + levelName;
  const idx = leaderboard.findIndex(e => e.username + '|' + e.levelName === key);
  const entry = { username, levelName, time, deaths: deaths || 0, ts: Date.now() };
  if (idx >= 0) { if (entry.time < leaderboard[idx].time) leaderboard[idx] = entry; }
  else leaderboard.push(entry);
  writeJSON(LB_FILE, leaderboard);
  res.json({ ok: true });
});

// ── Online count ──────────────────────────────────────────────────────────────
app.get('/api/online', (req, res) => {
  res.json({ count: Object.keys(players).length });
});

// ── TOS & Privacy Policy ──────────────────────────────────────────────────────
app.get('/tos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tos.html'));
});
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// ── Socket.io: Real-time ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);
  socket.emit('currentPlayers', players);

  socket.on('playerJoin', (data) => {
    const key = (data.username || '').toLowerCase();
    const u = users[key];
    if (u?.banned) {
      socket.emit('banned', { reason: u.banReason || 'You are banned.' });
      socket.disconnect();
      return;
    }
    players[socket.id] = {
      id:       socket.id,
      username: String(data.username || 'Pup').slice(0, 24),
      x: 0, y: 0, vx: 0, vy: 0,
      facing: 0,
      skin:   data.skin || 'base',
      level:  data.level || 0,
      action: 'idle',
      hp:     3,
      dead:   false,
      role:   u?.role || 'player',
      verified: u?.verified || false,
    };
    socket.broadcast.emit('playerJoined', players[socket.id]);
    systemMsg(`🐾 ${players[socket.id].username} joined the game!`);
  });

  socket.on('playerState', (data) => {
    const p = players[socket.id];
    if (!p) return;
    Object.assign(p, {
      x: data.x ?? p.x, y: data.y ?? p.y,
      vx: data.vx ?? p.vx, vy: data.vy ?? p.vy,
      facing: data.facing ?? p.facing,
      skin: data.skin ?? p.skin,
      level: data.level ?? p.level,
      action: data.action ?? p.action,
      hp: data.hp ?? p.hp,
      dead: data.dead ?? p.dead,
    });
    socket.broadcast.emit('playerState', { id: socket.id, ...p });
  });

  socket.on('chat', (data) => {
    const p = players[socket.id];
    const key = (p?.username || '').toLowerCase();
    const u = users[key];
    if (u?.banned) return;
    if (!data.text || data.text.length > 200) return;
    const rawText = String(data.text).slice(0, 200);

    // 🆘 Emergency check — runs BEFORE moderation so nothing is blocked
    checkEmergency(rawText, key, 'Public Chat');

    // Moderation: rate limit + grooming + profanity filter
    const mod = moderateMessage(rawText, key);
    if (mod.blocked) {
      if (mod.reason === 'rate_limit') socket.emit('chatBlocked', { reason: 'Slow down! You are sending messages too fast.' });
      if (mod.reason === 'grooming')   socket.emit('chatBlocked', { reason: 'Your message was blocked for violating community safety rules.' });
      return;
    }

    const msg = { username: p ? p.username : 'Guest', text: mod.filtered, ts: Date.now(), verified: u?.verified || false, role: u?.role || 'player' };
    chatHistory.push(msg);
    if (chatHistory.length > 80) chatHistory.shift();
    writeJSON(CHAT_FILE, chatHistory);
    broadcastChat(msg);
  });

  // ── Private real-time DM between friends ────────────────────────────────
  socket.on('privateMessage', (data) => {
    const sender = players[socket.id];
    if (!sender) return;
    const senderKey = sender.username.toLowerCase();
    const u = users[senderKey];
    if (u?.banned) return;
    if (!data.to || !data.text || data.text.length > 500) return;
    const rawText = String(data.text).slice(0, 500);
    const toKey = data.to.toLowerCase();

    // 🆘 Emergency check on private messages too
    checkEmergency(rawText, senderKey, `Private DM to ${data.to}`);
    // Also check if the RECIPIENT is describing an emergency
    checkEmergency(rawText, toKey, `Private DM received from ${sender.username}`);

    // Only friends can DM
    const senderFriends = friends[senderKey]?.friends || [];
    if (!senderFriends.includes(toKey) && u?.role !== 'owner') {
      socket.emit('dmError', { error: 'You must be friends to send private messages' });
      return;
    }
    const msg = {
      id: uid(), from: senderKey, to: toKey,
      subject: 'Private Message',
      body: String(data.text).slice(0, 500),
      ts: Date.now(), read: false, type: 'dm'
    };
    // Persist to mailbox
    mailbox.push(msg);
    if (mailbox.length > 5000) mailbox = mailbox.slice(-5000);
    writeJSON(MAIL_FILE, mailbox);
    // Deliver in real-time if recipient is online
    for (const [sid, p] of Object.entries(players)) {
      if (p.username?.toLowerCase() === toKey) {
        io.to(sid).emit('privateMessage', {
          id: msg.id, from: sender.username, text: data.text, ts: msg.ts
        });
        break;
      }
    }
    // Confirm to sender
    socket.emit('privateMessageSent', { id: msg.id, to: data.to, ts: msg.ts });
  });

  // ── Report a player as predator/threat ───────────────────────────────────
  socket.on('reportUser', (data) => {
    const sender = players[socket.id];
    if (!sender || !data.reportedUsername || !data.reason) return;
    const ownerEntry = Object.entries(users).find(([, u]) => u.role === 'owner');
    if (!ownerEntry) return;
    const [ownerAccountKey] = ownerEntry;
    const reportBody = [
      `🚨 REAL-TIME SAFETY REPORT from: ${sender.username}`,
      `Reported player: ${data.reportedUsername}`,
      `Reason: ${data.reason}`,
      data.evidence ? `Evidence:\n${String(data.evidence).slice(0, 1000)}` : '',
      `Time: ${new Date().toISOString()}`
    ].join('\n\n');
    const reportMsg = {
      id: uid(), from: sender.username.toLowerCase(), to: ownerAccountKey,
      subject: `🚨 Safety Report: ${data.reportedUsername}`,
      body: reportBody, ts: Date.now(), read: false, type: 'safety_report'
    };
    mailbox.push(reportMsg);
    writeJSON(MAIL_FILE, mailbox);
    // Notify owner in real-time
    for (const [sid, p] of Object.entries(players)) {
      if (p.username?.toLowerCase() === ownerAccountKey) {
        io.to(sid).emit('safetyReport', { from: sender.username, reported: data.reportedUsername, reason: data.reason });
      }
    }
    sendMail(OWNER_EMAIL, `🚨 Fluffy Safety Report: ${data.reportedUsername}`, `<pre>${reportBody}</pre>`).catch(() => {});
    socket.emit('reportConfirmed', { message: 'Your report has been sent to the owner. Stay safe! 🛡️' });
  });

  socket.on('submitScore', (data) => {
    const p = players[socket.id];
    if (!p || !data.levelName || typeof data.time !== 'number') return;
    const key = p.username + '|' + data.levelName;
    const idx = leaderboard.findIndex(e => e.username + '|' + e.levelName === key);
    const entry = { username: p.username, levelName: data.levelName, time: data.time, deaths: data.deaths || 0, ts: Date.now() };
    if (idx >= 0) { if (entry.time < leaderboard[idx].time) leaderboard[idx] = entry; }
    else leaderboard.push(entry);
    writeJSON(LB_FILE, leaderboard);
    io.emit('leaderboardUpdate', leaderboard.sort((a, b) => a.time - b.time).slice(0, 20));
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p) {
      systemMsg(`👋 ${p.username} left.`);
      console.log(`[-] ${p.username} disconnected`);
    }
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🐶 Fluffy Doghy Game Server  v4.0              ║');
  console.log(`║   http://localhost:${PORT}                          ║`);
  console.log('║                                                  ║');
  console.log('║   Auth:    /auth/send-otp  /auth/verify-otp     ║');
  console.log('║   Profile: /api/profile/:username               ║');
  console.log('║   Friends: /api/friends/:username               ║');
  console.log('║   Mailbox: /api/mail                            ║');
  console.log('║   Levels:  /api/levels                          ║');
  console.log('║   Updates: /api/updates                         ║');
  console.log('║   TOS:     /tos    Privacy: /privacy            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Owner email: ${OWNER_EMAIL}`);
  const gmailReady = process.env.GMAIL_APP_PASSWORD && process.env.GMAIL_APP_PASSWORD !== 'your_app_password_here';
  console.log(`  Gmail OTP:   ${gmailReady ? '✅ Ready' : '⚠️  Set GMAIL_APP_PASSWORD in .env'}`);
  console.log('');
});
