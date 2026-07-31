// Fluffy Doghy 🐶 — Online Levels & Project Manager System

window.OnlineLevelsSystem = {
    projects: [],
    communityLevels: [],

    init: function() {
        this.loadProjects();
    },

    loadProjects: function() {
        try {
            const saved = localStorage.getItem('fluffy_projects');
            if (saved) this.projects = JSON.parse(saved);
        } catch (e) {}
        if (!this.projects || !this.projects.length) {
            this.projects = [
                { id: 'proj_1', name: 'My Cyber Realm', author: 'Pup Creator', isHost: true, map: ['#################', '#S.............E#', '#################'], cols: 17, rows: 3 }
            ];
        }
    },

    saveProjects: function() {
        try {
            localStorage.setItem('fluffy_projects', JSON.stringify(this.projects));
        } catch (e) {}
    },

    // Show Project Manager Modal in Level Editor
    openProjectMenu: function() {
        let modal = document.getElementById('projectManagerModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'projectManagerModal';
            modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999;background:rgba(8,12,24,0.96);border:2px solid #36e0ff;border-radius:14px;padding:20px;min-width:340px;color:#fff;box-shadow:0 10px 40px rgba(0,0,0,0.7);font-family:sans-serif';
            document.body.appendChild(modal);
        }

        let h = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="color:#36e0ff;margin:0">📂 Level Projects</h3>
            <button onclick="document.getElementById('projectManagerModal').style.display='none'" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button>
        </div><div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">`;

        this.projects.forEach((proj, idx) => {
            h += `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px;display:flex;align-items:center;justify-content:space-between">
                <div>
                    <div style="font-weight:bold;color:#ffd35a">${proj.name}</div>
                    <div style="font-size:11px;opacity:.7">By ${proj.author} ${proj.isHost ? '👑 (Host)' : '👥 (Collab)'}</div>
                </div>
                <div style="display:flex;gap:6px">
                    <button onclick="OnlineLevelsSystem.editProject(${idx})" style="background:#534AB7;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-weight:bold">✏ Edit</button>
                    <button onclick="OnlineLevelsSystem.uploadProject(${idx})" style="background:#39ff14;color:#070a16;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-weight:bold">📤 Upload</button>
                </div>
            </div>`;
        });

        h += `</div><div style="margin-top:14px;display:flex;gap:8px;justify-content:center">
            <button onclick="OnlineLevelsSystem.newProject()" style="background:#ff007f;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:bold">+ New Project</button>
        </div>`;

        modal.innerHTML = h;
        modal.style.display = 'block';
    },

    newProject: function() {
        const name = prompt('Project Name:', 'Cyber Zone ' + (this.projects.length + 1)) || 'New Level';
        this.projects.push({
            id: 'proj_' + Date.now(),
            name, author: 'You', isHost: true,
            map: ['#################', '#S.............E#', '#################'],
            cols: 17, rows: 3
        });
        this.saveProjects();
        this.openProjectMenu();
    },

    editProject: function(idx) {
        const proj = this.projects[idx];
        if (proj) {
            // Apply project map to the editor
            if (typeof window.applyProject === 'function') {
                // proj structure uses .map, but applyProject expects .m
                window.applyProject({
                    m: proj.map,
                    deco: proj.deco || {},
                    bright: proj.bright || {},
                    theme: proj.theme || null,
                    mirror: proj.mirror,
                    dark: proj.dark,
                    autoscroll: proj.autoscroll
                });
            } else if (typeof window.editMap !== 'undefined') {
                window.editMap = proj.map;
            }
            
            document.getElementById('projectManagerModal').style.display = 'none';
            if (typeof toast === 'function') toast('✏ Loaded: ' + proj.name);
        }
    },

    uploadProject: function(idx) {
        const proj = this.projects[idx];
        if (!proj) return;
        
        if (!window.SAVE || !window.SAVE.loggedIn) {
            alert('❌ You must be signed in with Google to upload levels!');
            return;
        }

        if (proj.isHost === false) {
            alert('Only the Host creator can publish this collab project!');
            return;
        }

        // Set the author name to the logged in user's name
        proj.author = window.SAVE.lbName || 'Creator Dog';

        fetch(this.getApiUrl('/api/levels/upload'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proj)
        }).then(r => r.json()).then(data => {
            alert('🚀 Published level to Online Community Server!');
        }).catch(() => {
            alert('Published level to Community (Local Mode)!');
        });
    },

    getApiUrl: function(path) {
        const base = (location.protocol === 'file:') ? 'http://localhost:3000' : '';
        return base + path;
    },

    openCommunityLevelsMenu: function() {
        let modal = document.getElementById('communityLevelsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'communityLevelsModal';
            modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999;background:rgba(8,12,24,0.96);border:2px solid #36e0ff;border-radius:14px;padding:20px;min-width:380px;color:#fff;box-shadow:0 10px 40px rgba(0,0,0,0.7);font-family:sans-serif';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="color:#36e0ff;margin:0">🌍 Online Community Levels</h3>
            <button onclick="document.getElementById('communityLevelsModal').style.display='none'" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button>
        </div><div style="text-align:center;color:#fff;">Loading live levels...</div>`;
        modal.style.display = 'block';

        fetch(this.getApiUrl('/api/levels'))
            .then(res => res.json())
            .then(data => {
                let h = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                    <h3 style="color:#36e0ff;margin:0">🌍 Online Community Levels</h3>
                    <button onclick="document.getElementById('communityLevelsModal').style.display='none'" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button>
                </div><div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">`;

                if (data.levels && data.levels.length > 0) {
                    data.levels.forEach(lvl => {
                        if (!window.loadedCommunityLevels) window.loadedCommunityLevels = {};
                        window.loadedCommunityLevels[lvl.id] = lvl;

                        h += `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px;display:flex;align-items:center;justify-content:space-between">
                            <div>
                                <div style="font-weight:bold;color:#ffd35a">${lvl.name}</div>
                                <div style="font-size:11px;opacity:.7">By ${lvl.author} • ❤️ ${lvl.ratings || 0} Likes</div>
                            </div>
                            <button onclick="OnlineLevelsSystem.playCommunityLevel('${lvl.id}')" style="background:#534AB7;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:bold">▶ Play</button>
                        </div>`;
                    });
                } else {
                    h += `<div style="padding: 20px; text-align: center; color: #ffb;">No levels uploaded yet! Be the first!</div>`;
                }

                h += `</div>`;
                modal.innerHTML = h;
            })
            .catch(err => {
                modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                    <h3 style="color:#36e0ff;margin:0">🌍 Online Community Levels</h3>
                    <button onclick="document.getElementById('communityLevelsModal').style.display='none'" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button>
                </div><div style="padding: 20px; text-align: center; color: #ff5555;">Could not connect to the server.<br><br>Make sure node server.js is running.</div>`;
            });
    },

    playCommunityLevel: function(id) {
        if (window.loadedCommunityLevels && window.loadedCommunityLevels[id] && typeof window.playCustomLevel === 'function') {
            const lvl = window.loadedCommunityLevels[id];
            
            // Reconstruct the correct level object structure for loadLevelInternal
            const ld = {
                name: lvl.name || 'Community Level',
                cols: lvl.cols || 17,
                rows: lvl.rows || 12,
                map: lvl.map,
                deco: lvl.deco || {},
                bright: lvl.bright || {},
                theme: lvl.theme || null,
                gim: lvl.gim || ""
            };

            window.playCustomLevel(ld);
            document.getElementById('communityLevelsModal').style.display = 'none';
        }
    }
};

window.addEventListener('load', () => OnlineLevelsSystem.init());
