/* Multiplayer UI Logic */
window.mpUI = {
  token: localStorage.getItem('fluffyToken') || null,
  username: localStorage.getItem('fluffyUsername') || null,
  role: localStorage.getItem('fluffyRole') || null,
  
  init() {
    const layer = document.createElement('div');
    layer.id = 'mp-ui-layer';
    document.body.appendChild(layer);
    
    // Main HUD Button
    const hudBtn = document.createElement('div');
    hudBtn.id = 'mp-hud-btn';
    hudBtn.innerHTML = '🌍';
    hudBtn.onclick = () => this.showMainMenu();
    layer.appendChild(hudBtn);
    
    // Auto-connect if already logged in
    if (this.token && this.username) {
      if (window.mpClient) window.mpClient.connect(this.username, this.token);
    }
  },

  apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['token'] = this.token;
    if (this.username) headers['username'] = this.username;
    
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    
    return fetch(endpoint, opts).then(r => r.json());
  },
  
  createModal(id, title) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    
    const layer = document.getElementById('mp-ui-layer');
    const modal = document.createElement('div');
    modal.className = 'mp-modal';
    modal.id = id;
    
    modal.innerHTML = `
      <button class="mp-close" onclick="this.parentElement.remove()">×</button>
      <h2>${title}</h2>
      <div class="mp-modal-content"></div>
    `;
    
    layer.appendChild(modal);
    return modal.querySelector('.mp-modal-content');
  },

  showMainMenu() {
    if (!this.token) return this.showLogin();
    
    const content = this.createModal('mp-main-menu', '🌍 Fluffy Social Hub');
    content.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${localStorage.getItem('fluffyOriginalToken') ? `<button class="mp-btn" style="background:#e74c3c; font-weight:bold; border:2px solid #fff;" onclick="mpUI.revertHack()">⚠️ Revert Hack (Return to Owner)</button>` : ''}
        <button class="mp-btn" style="background:#2ecc71;" onclick="const btn=this; if(window.FluffySynth.toggle()) { btn.innerText='🔊 Synth Music: ON'; btn.style.background='#e74c3c'; } else { btn.innerText='🔈 Synth Music: OFF'; btn.style.background='#2ecc71'; }">🔈 Synth Music: OFF</button>
        <button class="mp-btn" onclick="mpUI.showLevels()">🎮 Community Levels</button>
        <button class="mp-btn" onclick="mpUI.showMailbox()">📬 Mailbox</button>
        <button class="mp-btn" onclick="mpUI.showFriends()">👥 Friends</button>
        <button class="mp-btn mp-btn-danger" style="margin-top: 10px;" onclick="mpUI.logout()">Logout</button>
      </div>
    `;
  },

  showLogin() {
    const content = this.createModal('mp-login', '🔐 Login / Register');
    content.innerHTML = `
      <p style="margin-bottom: 10px; font-size: 13px;">Enter your username and email. An OTP will be sent to verify your account.</p>
      <input type="text" id="lg-user" class="mp-input" placeholder="Username (2-24 chars)">
      <input type="email" id="lg-email" class="mp-input" placeholder="Email Address">
      <input type="password" id="lg-pass" class="mp-input" placeholder="Password (Legacy Login)" style="display:none;">
      
      <div style="margin: 10px 0; font-size: 12px; display: flex; align-items: center; gap: 6px;">
        <input type="checkbox" id="lg-tos" style="cursor: pointer;">
        <label for="lg-tos" style="color: #ccc;">I agree to the <a href="/public/tos.html" target="_blank" style="color: #7df9ff;">Terms of Service</a> & <a href="/public/privacy.html" target="_blank" style="color: #7df9ff;">Privacy Policy</a>.</label>
      </div>
      
      <div style="display: flex; gap: 6px; margin-bottom: 10px;">
        <button class="mp-btn" id="lg-send-btn" style="flex-grow: 1;" onclick="mpUI.sendOTP()">Send OTP</button>
        <button class="mp-btn" id="lg-legacy-btn" style="background:#534AB7;" onclick="mpUI.toggleLegacy()">Legacy</button>
      </div>
      
      <div id="lg-otp-section" style="display:none; margin-bottom: 10px;">
        <input type="text" id="lg-otp" class="mp-input" placeholder="Enter 6-digit OTP">
        <button class="mp-btn" onclick="mpUI.verifyOTP()">Verify & Login</button>
      </div>
      
      <button class="mp-btn" style="width: 100%; background: rgba(255,255,255,0.1);" onclick="mpUI.playAsGuest()">Play as Guest</button>
      <p id="lg-error" style="color:#f87171; margin-top: 8px; font-size:12px;"></p>
    `;
  },
  
  toggleLegacy() {
    const isLegacy = document.getElementById('lg-pass').style.display !== 'none';
    if (isLegacy) {
      document.getElementById('lg-pass').style.display = 'none';
      document.getElementById('lg-email').style.display = 'block';
      document.getElementById('lg-send-btn').innerText = 'Send OTP';
      document.getElementById('lg-send-btn').onclick = () => this.sendOTP();
      document.getElementById('lg-legacy-btn').innerText = 'Legacy';
    } else {
      document.getElementById('lg-pass').style.display = 'block';
      document.getElementById('lg-email').style.display = 'none';
      document.getElementById('lg-send-btn').innerText = 'Login';
      document.getElementById('lg-send-btn').onclick = () => this.legacyLogin();
      document.getElementById('lg-legacy-btn').innerText = 'OTP';
    }
  },
  
  playAsGuest() {
    if (!document.getElementById('lg-tos').checked) {
      return document.getElementById('lg-error').innerText = 'You must agree to the TOS & Privacy Policy first!';
    }
    document.getElementById('mp-ui-layer').style.display = 'none';
    if (typeof toast === 'function') toast('Playing as Guest. Multiplayer progress will not be saved.');
  },
  
  async legacyLogin() {
    if (!document.getElementById('lg-tos').checked) {
      return document.getElementById('lg-error').innerText = 'You must agree to the TOS & Privacy Policy first!';
    }
    const u = document.getElementById('lg-user').value;
    const p = document.getElementById('lg-pass').value;
    const err = document.getElementById('lg-error');
    err.innerText = 'Logging in...';
    
    // Server uses /auth/login for v4, or /login for v3. /auth/login is preferred.
    const res = await this.apiCall('/auth/login', 'POST', { username: u, password: p });
    if (res.error) {
      err.innerText = res.error;
    } else {
      this.token = res.token;
      this.username = res.username;
      this.role = res.role;
      localStorage.setItem('fluffyToken', res.token);
      localStorage.setItem('fluffyUsername', res.username);
      localStorage.setItem('fluffyRole', res.role);
      
      if (window.mpClient) window.mpClient.connect(this.username, this.token);
      this.showMainMenu();
    }
  },

  async sendOTP() {
    if (!document.getElementById('lg-tos').checked) {
      return document.getElementById('lg-error').innerText = 'You must agree to the TOS & Privacy Policy first!';
    }
    const u = document.getElementById('lg-user').value;
    const e = document.getElementById('lg-email').value;
    const err = document.getElementById('lg-error');
    err.innerText = 'Sending...';
    
    const res = await this.apiCall('/auth/send-otp', 'POST', { username: u, email: e });
    if (res.error) {
      err.innerText = res.error;
    } else {
      err.innerText = 'OTP Sent! Check your email.';
      err.style.color = '#7dffb0';
      document.getElementById('lg-send-btn').style.display = 'none';
      document.getElementById('lg-legacy-btn').style.display = 'none';
      document.getElementById('lg-otp-section').style.display = 'block';
    }
  },

  async verifyOTP() {
    const u = document.getElementById('lg-user').value;
    const e = document.getElementById('lg-email').value;
    const code = document.getElementById('lg-otp').value;
    const err = document.getElementById('lg-error');
    err.innerText = 'Verifying...';
    err.style.color = '#f87171';
    
    const res = await this.apiCall('/auth/verify-otp', 'POST', { email: e, code, username: u });
    if (res.error) {
      err.innerText = res.error;
    } else {
      this.token = res.token;
      this.username = res.username;
      this.role = res.role;
      localStorage.setItem('fluffyToken', res.token);
      localStorage.setItem('fluffyUsername', res.username);
      localStorage.setItem('fluffyRole', res.role);
      
      if (window.mpClient) window.mpClient.connect(this.username, this.token);
      this.showMainMenu();
    }
  },

  logout() {
    this.token = null;
    this.username = null;
    this.role = null;
    localStorage.removeItem('fluffyToken');
    localStorage.removeItem('fluffyUsername');
    localStorage.removeItem('fluffyRole');
    localStorage.removeItem('fluffyOriginalToken');
    localStorage.removeItem('fluffyOriginalUser');
    localStorage.removeItem('fluffyOriginalRole');
    if (window.mpClient) window.mpClient.disconnect();
    this.showLogin();
  },

  async showLevels(page = 1) {
    const content = this.createModal('mp-levels', '🎮 Community Levels');
    content.innerHTML = '<p>Loading...</p>';
    const res = await this.apiCall('/api/levels');
    if (res.error) return content.innerHTML = `<p>${res.error}</p>`;
    
    let html = `<div class="mp-list" style="max-height: 400px;">`;
    for (const lvl of res.levels) {
      const score = lvl.ratings || 0;
      html += `
        <div class="mp-list-item" style="flex-direction: column; align-items: flex-start; gap: 4px;">
          <div style="display:flex; justify-content: space-between; width: 100%;">
            <strong>${lvl.name}</strong> <span style="color:#ffd35a;">Score: ${score}</span>
          </div>
          <div style="font-size: 11px; color:#aaa;">By: ${lvl.author}</div>
          <div style="display:flex; gap: 6px; margin-top: 6px;">
            <button class="mp-btn mp-btn-sm" onclick="mpUI.playLevel('${lvl.id}')">Play</button>
            <button class="mp-btn mp-btn-sm" style="background:#2ecc71;" onclick="mpUI.rateLevel('${lvl.id}', 'like')">👍</button>
            <button class="mp-btn mp-btn-sm" style="background:#e74c3c;" onclick="mpUI.rateLevel('${lvl.id}', 'dislike')">👎</button>
            <button class="mp-btn mp-btn-sm" style="background:#9b59b6;" onclick="mpUI.showComments('${lvl.id}')">💬 Comments</button>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    content.innerHTML = html;
  },

  async rateLevel(id, action) {
    const res = await this.apiCall('/api/levels/rate', 'POST', { id, action });
    if (res.error) alert(res.error);
    else this.showLevels();
  },

  async showComments(levelId, page = 1) {
    const content = this.createModal('mp-comments', '💬 Comments');
    content.innerHTML = '<p>Loading...</p>';
    const res = await this.apiCall(`/api/levels/${levelId}/comments?page=${page}`);
    if (res.error) return content.innerHTML = `<p>${res.error}</p>`;
    
    let html = `
      <div style="display:flex; gap: 6px; margin-bottom: 12px;">
        <input type="text" id="com-input" class="mp-input" style="margin:0;" placeholder="Add a comment...">
        <button class="mp-btn" onclick="mpUI.postComment('${levelId}')">Post</button>
      </div>
      <div class="mp-list" style="max-height: 300px;">
    `;
    
    for (const c of res.comments) {
      const likes = c.likes ? c.likes.length : 0;
      const dislikes = c.dislikes ? c.dislikes.length : 0;
      html += `
        <div class="mp-list-item" style="flex-direction: column; align-items: flex-start; gap: 4px;">
          <div style="display:flex; justify-content: space-between; width: 100%; font-size:11px; color:#aaa;">
            <strong style="color:#7df9ff; cursor:pointer;" onclick="mpUI.showProfile('${c.username}')">${c.username}</strong>
            <span>${new Date(c.ts).toLocaleString()}</span>
          </div>
          <div>${c.text}</div>
          <div style="display:flex; gap: 8px; margin-top: 4px; font-size: 11px;">
            <span style="cursor:pointer;" onclick="mpUI.rateComment('${levelId}', '${c.id}', 'like')">👍 ${likes}</span>
            <span style="cursor:pointer;" onclick="mpUI.rateComment('${levelId}', '${c.id}', 'dislike')">👎 ${dislikes}</span>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    
    // Pagination
    if (res.totalPages > 1) {
      html += `<div style="display:flex; justify-content:center; gap: 10px; margin-top:10px;">`;
      if (page > 1) html += `<button class="mp-btn" onclick="mpUI.showComments('${levelId}', ${page-1})">Previous</button>`;
      html += `<span>Page ${page} of ${res.totalPages}</span>`;
      if (page < res.totalPages) html += `<button class="mp-btn" onclick="mpUI.showComments('${levelId}', ${page+1})">Next</button>`;
      html += `</div>`;
    }
    
    content.innerHTML = html;
  },

  async postComment(levelId) {
    const text = document.getElementById('com-input').value;
    if (!text) return;
    const res = await this.apiCall('/api/levels/comment', 'POST', { id: levelId, text });
    if (res.error) alert(res.error);
    else this.showComments(levelId);
  },
  
  async rateComment(levelId, commentId, action) {
    const res = await this.apiCall('/api/levels/comment/rate', 'POST', { levelId, commentId, action });
    if (res.error) alert(res.error);
    else this.showComments(levelId);
  },

  async showProfile(username) {
    const content = this.createModal('mp-profile', '👤 Profile: ' + username);
    content.innerHTML = '<p>Loading...</p>';
    const res = await this.apiCall('/api/profile/' + username);
    if (res.error) return content.innerHTML = `<p>${res.error}</p>`;
    
    content.innerHTML = `
      <div style="display:flex; flex-direction:column; gap: 8px;">
        <div><strong>Role:</strong> ${res.role} ${res.verified ? '✅' : ''}</div>
        <div><strong>Bones:</strong> 🦴 ${res.bones}</div>
        <div><strong>Friends:</strong> ${res.friendCount}</div>
        <div><strong>Bio:</strong> ${res.bio || 'No bio yet.'}</div>
        <div style="margin-top: 12px; display:flex; gap:8px;">
          <button class="mp-btn" onclick="mpUI.addFriend('${username}')">Add Friend</button>
          <button class="mp-btn mp-btn-danger" onclick="mpUI.reportUser('${username}')">🚨 Report</button>
          ${this.role === 'owner' && username.toLowerCase() !== this.username.toLowerCase() ? `<button class="mp-btn" style="background:#e67e22;" onclick="mpUI.hackAccount('${username}')">👾 Hack Account</button>` : ''}
        </div>
      </div>
    `;
  },
  
  async reportUser(username) {
    const reason = prompt(`Report ${username} for breaking safety rules. What happened?`);
    if (!reason) return;
    const res = await this.apiCall('/api/report', 'POST', { reportedUsername: username, reason });
    if (res.ok) alert(res.message);
    else alert(res.error || 'Report failed');
  },
  
  async hackAccount(username) {
    if (!confirm(`Are you sure you want to hack into ${username}'s account? You will not be able to chat or see private info while impersonating.`)) return;
    const res = await this.apiCall('/api/owner/hack/' + username);
    if (res.error) return alert(res.error);
    
    // Save original credentials
    localStorage.setItem('fluffyOriginalToken', this.token);
    localStorage.setItem('fluffyOriginalUser', this.username);
    localStorage.setItem('fluffyOriginalRole', this.role);
    
    // Become hacked user
    this.token = res.token;
    this.username = res.username;
    this.role = res.role;
    localStorage.setItem('fluffyToken', res.token);
    localStorage.setItem('fluffyUsername', res.username);
    localStorage.setItem('fluffyRole', res.role);
    
    if (window.mpClient) {
      window.mpClient.disconnect();
      window.mpClient.connect(this.username, this.token);
    }
    document.querySelectorAll('.mp-modal').forEach(m => m.remove());
    this.showMainMenu();
    if (typeof toast === 'function') toast('👾 Account hacked: ' + username);
  },
  
  revertHack() {
    this.token = localStorage.getItem('fluffyOriginalToken');
    this.username = localStorage.getItem('fluffyOriginalUser');
    this.role = localStorage.getItem('fluffyOriginalRole');
    
    localStorage.setItem('fluffyToken', this.token);
    localStorage.setItem('fluffyUsername', this.username);
    localStorage.setItem('fluffyRole', this.role);
    
    localStorage.removeItem('fluffyOriginalToken');
    localStorage.removeItem('fluffyOriginalUser');
    localStorage.removeItem('fluffyOriginalRole');
    
    if (window.mpClient) {
      window.mpClient.disconnect();
      window.mpClient.connect(this.username, this.token);
    }
    document.querySelectorAll('.mp-modal').forEach(m => m.remove());
    this.showMainMenu();
    if (typeof toast === 'function') toast('✅ Returned to owner account');
  },
  
  async addFriend(target) {
    const res = await this.apiCall('/api/friends/request', 'POST', { target });
    if (res.ok) alert('Friend request sent!');
    else alert(res.error);
  },

  async showFriends() {
    const content = this.createModal('mp-friends', '👥 Friends');
    content.innerHTML = '<p>Loading...</p>';
    const res = await this.apiCall('/api/friends');
    if (res.error) return content.innerHTML = `<p>${res.error}</p>`;
    
    let html = `<div class="mp-list" style="max-height: 300px;">`;
    
    if (res.requests && res.requests.length > 0) {
      html += `<h4>Friend Requests</h4>`;
      for (const req of res.requests) {
        html += `
          <div class="mp-list-item">
            <span>${req}</span>
            <div style="display:flex; gap:6px;">
              <button class="mp-btn mp-btn-sm" style="background:#2ecc71;" onclick="mpUI.respondFriend('${req}', 'accept')">Accept</button>
              <button class="mp-btn mp-btn-sm mp-btn-danger" onclick="mpUI.respondFriend('${req}', 'reject')">Decline</button>
            </div>
          </div>
        `;
      }
    }
    
    html += `<h4 style="margin-top:10px;">My Friends</h4>`;
    if (!res.friends || res.friends.length === 0) {
      html += `<p style="font-size:12px; color:#aaa;">No friends yet.</p>`;
    } else {
      for (const f of res.friends) {
        html += `
          <div class="mp-list-item">
            <span style="color:#7df9ff; cursor:pointer;" onclick="mpUI.showProfile('${f}')">${f}</span>
            ${this.role === 'owner' ? `<button class="mp-btn mp-btn-sm" onclick="mpUI.showMailbox('${f}')">💬 Message</button>` : ''}
          </div>
        `;
      }
    }
    html += `</div>`;
    content.innerHTML = html;
  },

  async respondFriend(target, action) {
    const res = await this.apiCall('/api/friends/respond', 'POST', { target, action });
    if (res.ok) this.showFriends();
    else alert(res.error);
  },

  async showMailbox(threadUser = null) {
    const title = threadUser ? `💬 Chat: ${threadUser}` : '📬 Updates & Mail';
    const content = this.createModal('mp-mailbox', title);
    content.innerHTML = '<p>Loading...</p>';
    
    if (threadUser) {
      const res = await this.apiCall('/api/mail/thread/' + threadUser);
      if (res.error) return content.innerHTML = `<p>${res.error}</p>`;
      
      let html = `<div class="mp-list" style="max-height: 300px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">`;
      for (const m of res.thread) {
        const align = m.from === this.username.toLowerCase() ? 'flex-end' : 'flex-start';
        const bg = m.from === this.username.toLowerCase() ? '#534AB7' : 'rgba(255,255,255,0.15)';
        html += `
          <div style="align-self: ${align}; background: ${bg}; padding: 10px 14px; border-radius: 12px; margin-bottom: 6px; max-width: 85%;">
            <div style="font-size:10px; color:#ddd; margin-bottom:4px; font-weight: bold;">${m.from} - ${new Date(m.ts).toLocaleString()}</div>
            <div style="line-height: 1.4;">${m.body}</div>
          </div>
        `;
      }
      html += `</div>`;
      if (this.role === 'owner') {
        html += `
          <div style="display:flex; gap: 8px; margin-top: 12px;">
            <input type="text" id="mail-reply" class="mp-input" style="margin:0; flex-grow: 1;" placeholder="Type a message...">
            <button class="mp-btn" style="background: #534AB7;" onclick="mpUI.sendMail('${threadUser}')">Send</button>
          </div>
        `;
      }
      content.innerHTML = html;
    } else {
      const res = await this.apiCall('/api/mail');
      if (res.error) return content.innerHTML = `<p>${res.error}</p>`;
      
      let html = '';
      if (this.role === 'owner') {
        html += `
          <button class="mp-btn" style="background:#e67e22; width: 100%; margin-bottom: 12px; font-weight: bold;" onclick="mpUI.showBroadcastComposer()">
            📢 Compose Global Update
          </button>
        `;
      }
      
      html += `<div class="mp-list" style="max-height: 400px; gap: 4px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 4px; background: #1a1a2e;">`;
      if (res.mail.length === 0) html += `<div style="padding: 20px; text-align: center; color: #888;">Your inbox is empty.</div>`;
      for (const m of res.mail) {
        const isUnread = !m.read;
        const borderCol = isUnread ? '#7df9ff' : 'transparent';
        const bgCol = isUnread ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.2)';
        
        html += `
          <div class="mp-list-item" style="flex-direction: column; align-items: flex-start; gap: 6px; border-left: 4px solid ${borderCol}; background: ${bgCol}; padding: 12px; border-radius: 4px; cursor: pointer;" onclick="const d=this.querySelector('.mail-body'); if(d.style.display==='none'){ d.style.display='block'; if(${isUnread}) mpUI.markMailRead('${m.id}'); } else { d.style.display='none'; }">
            <div style="display:flex; justify-content: space-between; width: 100%; font-size:12px;">
              <strong style="color: ${m.from === 'owner' ? '#e67e22' : '#fff'};">${m.from === 'owner' ? '📢 OFFICIAL UPDATE' : 'From: ' + m.from}</strong>
              <span style="color: #aaa;">${new Date(m.ts).toLocaleString()}</span>
            </div>
            <div style="font-weight: ${isUnread ? 'bold' : 'normal'}; font-size: 14px; margin-top: 2px;">${m.subject}</div>
            
            <div class="mail-body" style="display: none; width: 100%; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); color: #ccc; line-height: 1.5;">
              ${m.body.replace(/\n/g, '<br>')}
              <div style="display:flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
                ${this.role === 'owner' && m.from !== 'owner' && m.from !== 'System' ? `<button class="mp-btn mp-btn-sm" onclick="event.stopPropagation(); mpUI.showMailbox('${m.from}')">Reply in Chat</button>` : ''}
                <button class="mp-btn mp-btn-sm mp-btn-danger" onclick="event.stopPropagation(); mpUI.deleteMail('${m.id}')">Delete</button>
              </div>
            </div>
          </div>
        `;
      }
      html += `</div>`;
      content.innerHTML = html;
    }
  },

  showBroadcastComposer() {
    const content = this.createModal('mp-broadcast', '📢 Compose Global Update');
    content.innerHTML = `
      <div style="display:flex; flex-direction: column; gap: 12px;">
        <div>
          <label style="font-size:12px; color:#aaa;">Subject</label>
          <input type="text" id="bc-subject" class="mp-input" placeholder="e.g. Patch Note v4.1" style="width: 100%; box-sizing: border-box;">
        </div>
        <div>
          <label style="font-size:12px; color:#aaa;">Message</label>
          <textarea id="bc-body" class="mp-input" rows="6" placeholder="Write your update here..." style="width: 100%; box-sizing: border-box; resize: vertical;"></textarea>
        </div>
        <button class="mp-btn" style="background:#e67e22; font-weight:bold; padding: 12px;" onclick="mpUI.sendBroadcast()">🚀 Send to Everyone</button>
      </div>
    `;
  },

  async sendBroadcast() {
    const subject = document.getElementById('bc-subject').value;
    const body = document.getElementById('bc-body').value;
    if (!body) return alert('Message cannot be empty!');
    
    if (!confirm('Are you sure you want to broadcast this to ALL players?')) return;
    
    const res = await this.apiCall('/api/owner/broadcast-mail', 'POST', { subject, body });
    if (res.error) alert(res.error);
    else {
      alert(`Successfully sent update to ${res.sent} players!`);
      this.showMailbox();
    }
  },
  
  async sendMail(to) {
    const body = document.getElementById('mail-reply').value;
    if (!body) return;
    const res = await this.apiCall('/api/mail/send', 'POST', { to, subject: 'DM', body });
    if (res.error) alert(res.error);
    else this.showMailbox(to);
  },
  
  async markMailRead(id) {
    // Only fire and forget for UI snappiness
    this.apiCall('/api/mail/read/' + id, 'POST').then(() => {
      // Small delay then refresh UI if they want, but the DOM is already showing it.
      // this.showMailbox();
    });
  },
  
  async deleteMail(id) {

    await this.apiCall('/api/mail/' + id, 'DELETE');
    this.showMailbox();
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.mpUI.init();
});
