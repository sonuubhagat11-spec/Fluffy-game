    eventSource: null,

    init: function() {
        this.createChatOverlay();
        this.connectStream();
    },

    connectStream: function() {
        const base = (location.protocol === 'file:') ? 'http://localhost:3000' : '';
        if (this.eventSource) this.eventSource.close();
        
        this.eventSource = new EventSource(base + '/api/chat/stream');
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'history') {
                    this.renderHistory(data.history);
                } else if (data.type === 'message') {
                    this.appendMessage(data.message);
                } else if (data.type === 'count') {
                    document.getElementById('globeOnlineCount').innerText = `● ${data.count} Online`;
                }
            } catch (e) {
                console.error('SSE Error:', e);
            }
        };
        
        this.eventSource.onerror = () => {
            // Retry connection silently
        };
    },

    renderHistory: function(list) {
        const msgs = document.getElementById('globeMessages');
        if (!msgs) return;
        msgs.innerHTML = list.map(m => `<div><b style="color:${m.username === 'System' ? '#ffd35a' : '#36e0ff'}">${m.username}:</b> ${m.text}</div>`).join('');
        msgs.scrollTop = msgs.scrollHeight;
    },

    appendMessage: function(m) {
        const msgs = document.getElementById('globeMessages');
        if (!msgs) return;
        const div = document.createElement('div');
        div.innerHTML = `<div><b style="color:${m.username === 'System' ? '#ffd35a' : '#36e0ff'}">${m.username}:</b> ${m.text}</div>`;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    },

    createChatOverlay: function() {
        if (document.getElementById('globeChatBox')) return;
        
        const box = document.createElement('div');
        box.id = 'globeChatBox';
        box.style.cssText = 'position:fixed;top:15px;left:15px;z-index:90;width:280px;background:rgba(8,12,24,0.75);border:1px solid rgba(54,224,255,0.3);border-radius:12px;padding:12px;color:#fff;backdrop-filter:blur(10px);font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);transition:opacity 0.3s;';
        box.innerHTML = `
            <div style="font-weight:bold;color:#36e0ff;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                <span>💬 Global Lobby Chat</span>
                <span id="globeOnlineCount" style="color:#39ff14;font-size:10px;background:rgba(57,255,20,0.15);padding:2px 6px;border-radius:20px;">● 1 Online</span>
            </div>
            <div id="globeMessages" style="height:110px;overflow-y:auto;background:rgba(0,0,0,0.4);border-radius:8px;padding:8px;margin-bottom:8px;font-size:11px;display:flex;flex-direction:column;gap:6px;border:1px solid rgba(255,255,255,0.05)">
            </div>
            <div style="display:flex;gap:6px">
                <input id="globeChatInput" type="text" placeholder="Sign in to chat..." style="flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(54,224,255,0.3);color:#fff;border-radius:6px;padding:6px 10px;font-size:11px;outline:none;" disabled>
                <button id="globeChatSendBtn" onclick="RealTimeGlobe.sendChat()" style="background:rgba(54,224,255,0.2);color:#36e0ff;border:1px solid #36e0ff;border-radius:6px;padding:6px 12px;font-weight:bold;cursor:pointer;font-size:11px;transition:0.2s;" disabled>Send</button>
            </div>
        `;
        document.body.appendChild(box);

        document.getElementById('globeChatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });
        
        this.updateAuthStatus();
    },

    updateAuthStatus: function() {
        const input = document.getElementById('globeChatInput');
        const btn = document.getElementById('globeChatSendBtn');
        const isLoggedIn = window.SAVE && window.SAVE.loggedIn;
        
        if (input && btn) {
            if (isLoggedIn) {
                input.placeholder = "Type a message...";
                input.disabled = false;
                btn.disabled = false;
                btn.style.background = '#36e0ff';
                btn.style.color = '#070a16';
            } else {
                input.placeholder = "Sign in to chat...";
                input.disabled = true;
                btn.disabled = true;
                btn.style.background = 'rgba(54,224,255,0.2)';
                btn.style.color = '#36e0ff';
            }
        }
    },

    sendChat: function() {
        if (!window.SAVE || !window.SAVE.loggedIn) return;

        const inp = document.getElementById('globeChatInput');
        const txt = (inp.value || '').trim();
        if (!txt) return;

        const name = window.SAVE.lbName || 'Player';
        const base = (location.protocol === 'file:') ? 'http://localhost:3000' : '';
        
        fetch(base + '/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, text: txt })
        });

        inp.value = '';
    }
};

window.addEventListener('load', () => RealTimeGlobe.init());
