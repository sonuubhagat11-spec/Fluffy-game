/**
 * Fluffy Doghy 🐶 — Multiplayer Client  v3.0
 *
 * Handles:
 *  • Socket.io connection to the game server
 *  • Sending local player state ~20× / sec
 *  • Receiving + storing remote player states
 *  • Exposing mpClient.drawRemotePlayers(ctx) for the render loop
 *  • Leaderboard submission
 *
 * Requires socket.io client loaded before this script.
 * The game calls mpClient.init() after login and mpClient.tick(player) each frame.
 */
'use strict';

window.mpClient = (function () {
  // ── Config ──────────────────────────────────────────────────────────────
  const SERVER = (location.protocol === 'file:')
    ? 'http://localhost:3000'
    : (location.origin);           // Same-origin when served by the server

  const SEND_INTERVAL_MS = 50;     // ~20 updates/second to server
  const GHOST_ALPHA       = 0.75;  // opacity of remote players
  const NAME_FONT         = '10px Fredoka, sans-serif';
  const PING_INTERVAL_MS  = 2000;

  // ── State ────────────────────────────────────────────────────────────────
  let socket        = null;
  let connected     = false;
  let localUsername = null;
  let localSkin     = 'base';
  let localLevel    = 0;
  let lastSend      = 0;
  let pingInterval  = null;

  // Remote players:  id → { id, username, skin, x, y, vx, vy, facing, action, hp, dead, level, lastSeen }
  const remotePlayers = {};

  // Callbacks (set by the game after init)
  const callbacks = {
    onConnect:    () => {},
    onDisconnect: () => {},
    onPlayerJoined: (p) => { if (typeof toast === 'function') toast(`🐾 ${p.username} joined!`); },
    onPlayerLeft:   (id) => {},
    onChat:         (msg) => {},
  };

  // ── Connection ───────────────────────────────────────────────────────────
  function connect(username, token, skinId, levelIdx) {
    if (socket && socket.connected) return;   // already connected

    localUsername = username;
    localSkin     = skinId  || 'base';
    localLevel    = levelIdx || 0;
    
    // Store token globally so _connect can use it
    window._mpToken = token;

    // Dynamically load socket.io if not already present
    if (typeof io === 'undefined') {
      const s = document.createElement('script');
      s.src = SERVER + '/socket.io/socket.io.js';
      s.onload = () => _connect();
      document.head.appendChild(s);
    } else {
      _connect();
    }
  }

  function _connect() {
    socket = io(SERVER, { 
      auth: { token: window._mpToken, username: localUsername },
      transports: ['websocket', 'polling'] 
    });

    socket.on('connect', () => {
      connected = true;
      console.log('[MP] Connected:', socket.id);
      socket.emit('playerJoin', {
        username: localUsername,
        skin:     localSkin,
        level:    localLevel,
      });
      _showStatus('🟢 Online');
      callbacks.onConnect();
    });

    socket.on('disconnect', () => {
      connected = false;
      _showStatus('🔴 Offline');
      callbacks.onDisconnect();
    });
    
    // Safety & Moderation Alerts
    socket.on('banned', (reason) => {
      alert('🚨 YOU HAVE BEEN BANNED 🚨\nReason: ' + reason);
      window.mpUI.logout();
    });
    socket.on('ownerAlert', (msg) => alert('👑 OWNER MESSAGE:\n' + msg));
    socket.on('emergencyAlert', (msg) => alert('🚨 EMERGENCY ALERT:\n' + msg));
    socket.on('privateMessage', (msg) => {
      if (typeof toast === 'function') toast(`📬 DM from ${msg.from}: ${msg.body}`);
      else alert(`📬 DM from ${msg.from}: ${msg.body}`);
    });

    // Snapshot of all currently online players
    socket.on('currentPlayers', (snapshot) => {
      for (const id in snapshot) {
        if (id === socket.id) continue;
        remotePlayers[id] = { ...snapshot[id], lastSeen: Date.now() };
      }
    });

    // New player joined
    socket.on('playerJoined', (p) => {
      if (p.id === socket?.id) return;
      remotePlayers[p.id] = { ...p, lastSeen: Date.now() };
      callbacks.onPlayerJoined(p);
    });

    // Remote player state update
    socket.on('playerState', (data) => {
      if (data.id === socket?.id) return;
      if (!remotePlayers[data.id]) {
        remotePlayers[data.id] = { username: '?', skin: 'base' };
      }
      Object.assign(remotePlayers[data.id], data, { lastSeen: Date.now() });
    });

    // Player left
    socket.on('playerLeft', (id) => {
      delete remotePlayers[id];
      callbacks.onPlayerLeft(id);
    });

    // Leaderboard update broadcast
    socket.on('leaderboardUpdate', (entries) => {
      window._mpLeaderboard = entries;
    });

    socket.on('connect_error', (e) => {
      console.warn('[MP] Connection error:', e.message);
      if (e.message.includes('Authentication error')) {
        alert('Authentication failed. Please log in again.');
        window.mpUI.logout();
      }
    });

    // Stale-player cleanup — remove players we haven't heard from in 10s
    pingInterval = setInterval(() => {
      const now = Date.now();
      for (const id in remotePlayers) {
        if (now - (remotePlayers[id].lastSeen || 0) > 10000) {
          delete remotePlayers[id];
        }
      }
    }, PING_INTERVAL_MS);
  }

  function disconnect() {
    if (socket) { socket.disconnect(); socket = null; }
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    connected = false;
    for (const k in remotePlayers) delete remotePlayers[k];
  }

  // ── Per-frame tick (called from game loop) ───────────────────────────────
  function tick(player) {
    if (!socket || !connected || !player) return;
    const now = Date.now();
    if (now - lastSend < SEND_INTERVAL_MS) return;
    lastSend = now;

    // Derive current animation action from player state
    const vy = player.vy || 0, vx = player.vx || 0;
    let action = 'idle';
    if (player.hp <= 0 || player.dead) action = 'faint';
    else if (player.dashing || (player.dashT || 0) > 0) action = 'sprint';
    else if (player.sliding)   action = 'slide';
    else if (vy > 0.6)         action = 'down';
    else if (vy < -0.6)        action = 'jump';
    else if (Math.abs(vx) > 0.3) action = vx > 0 ? 'walkRight' : 'walkLeft';

    socket.emit('playerState', {
      x:      player.x,
      y:      player.y,
      vx:     player.vx || 0,
      vy:     player.vy || 0,
      facing: player.facing || 0,
      skin:   (typeof currentSkin === 'function' ? currentSkin().id : null) || localSkin,
      level:  (typeof lvIdx !== 'undefined' ? lvIdx : 0),
      action,
      hp:     player.hp ?? 3,
      dead:   player.hp <= 0 || !!player.dead,
    });
  }

  // ── Draw remote players ──────────────────────────────────────────────────
  function drawRemotePlayers(ctxRef) {
    if (!ctxRef) return;
    const now = Date.now();
    for (const id in remotePlayers) {
      const rp = remotePlayers[id];
      // Only draw players on the same level (lvIdx global)
      if (typeof lvIdx !== 'undefined' && rp.level !== lvIdx) continue;
      if (!rp.x && !rp.y) continue;

      ctxRef.save();
      ctxRef.globalAlpha = GHOST_ALPHA;

      // Use the game's own drawFluffy() so remotes get the right skin + animation
      // We fake a minimal player object matching what drawFluffy expects
      const ghost = {
        x:       rp.x,
        y:       rp.y,
        vx:      rp.vx || 0,
        vy:      rp.vy || 0,
        facing:  rp.facing || 0,
        hp:      rp.dead ? 0 : (rp.hp ?? 3),
        dead:    rp.dead || false,
        dashing: rp.action === 'sprint',
        dashT:   rp.action === 'sprint' ? 1 : 0,
        sliding: rp.action === 'slide',
        spider:  false,
      };

      // Skin override: if remote player uses a known skin ID, use it
      const prevOverride = window._skinOverride;
      try {
        if (rp.skin && rp.skin !== 'base') window._skinOverride = rp.skin;
        if (typeof drawFluffy === 'function') drawFluffy(ghost, true);
      } catch (e) {
        // Fallback: simple colored circle
        ctxRef.fillStyle = '#ff99cc';
        ctxRef.beginPath();
        ctxRef.arc(rp.x, rp.y, 14, 0, Math.PI * 2);
        ctxRef.fill();
      } finally {
        window._skinOverride = prevOverride;
      }

      // Name tag
      ctxRef.globalAlpha = 0.92;
      ctxRef.font        = NAME_FONT;
      ctxRef.textAlign   = 'center';
      ctxRef.textBaseline = 'bottom';
      ctxRef.fillStyle   = '#fff';
      ctxRef.strokeStyle = 'rgba(0,0,0,0.7)';
      ctxRef.lineWidth   = 2.5;
      const tag = (rp.username || '?').slice(0, 16);
      const T_SIZE = (typeof T !== 'undefined') ? T : 40;
      ctxRef.strokeText(tag, rp.x, rp.y - T_SIZE * 0.55);
      ctxRef.fillText(  tag, rp.x, rp.y - T_SIZE * 0.55);

      ctxRef.restore();
    }
  }

  // ── Leaderboard submit ───────────────────────────────────────────────────
  function submitScore(levelName, timeMs, deaths) {
    if (!socket || !connected) {
      // Fallback: REST endpoint
      const base = (location.protocol === 'file:') ? 'http://localhost:3000' : '';
      fetch(base + '/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: localUsername, levelName, time: timeMs, deaths })
      }).catch(() => {});
      return;
    }
    socket.emit('submitScore', { levelName, time: timeMs, deaths });
  }

  // ── Chat via socket ──────────────────────────────────────────────────────
  function sendChatSocket(text) {
    if (!socket || !connected) return false;
    socket.emit('chat', { text });
    return true;
  }

  // ── Online-player HUD badge ─────────────────────────────────────────────
  function _showStatus(text) {
    let el = document.getElementById('mpStatusBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mpStatusBadge';
      el.style.cssText = [
        'position:fixed', 'bottom:10px', 'right:10px', 'z-index:95',
        'background:rgba(8,12,24,0.82)', 'color:#fff',
        'font:bold 11px Fredoka,sans-serif',
        'padding:4px 10px', 'border-radius:20px',
        'border:1px solid rgba(255,255,255,0.15)',
        'backdrop-filter:blur(6px)', 'pointer-events:none',
        'transition:opacity .4s'
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  // ── Online count badge in chat overlay ───────────────────────────────────
  // (already handled by RealTimeGlobe SSE — we just patch the socket count in)
  function getOnlineCount() {
    return Object.keys(remotePlayers).length + (connected ? 1 : 0);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    connect,
    disconnect,
    tick,
    drawRemotePlayers,
    submitScore,
    sendChatSocket,
    getOnlineCount,
    isConnected: () => connected,
    getRemotePlayers: () => remotePlayers,
    on(event, fn) { if (callbacks[event] !== undefined) callbacks[event] = fn; },
  };
})();
