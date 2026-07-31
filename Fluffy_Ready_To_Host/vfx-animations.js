// Fluffy Doghy 🐶 — VFX & Animations Engine
// 3 Ultra Visual Modes (Vanilla, Fantasy, Realistic) + Feathery Ghostbuster Beam VFX

window.VFXEngine = {
    mode: 2, // 1: Vanilla, 2: Fantasy, 3: Realistic
    particles: [],

    setMode: function(m) {
        this.mode = m;
        if (typeof toast === 'function') {
            toast(m === 1 ? '🎨 Ultra Visuals: Vanilla' : m === 2 ? '✨ Ultra Visuals: Fantasy' : '🏙️ Ultra Visuals: Realistic');
        }
    },

    // Feathery Spirit Energy Particles for Ghostbuster Beam
    spawnFeatheryBeam: function(ctx, x, y, angle, length, W, H) {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const px = -dy, py = dx;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < 22; i++) {
            const dist = (i / 22) * length;
            const featherOffset = Math.sin(Date.now() * 0.012 + i * 0.45) * 16;
            const fx = x + dx * dist + px * featherOffset;
            const fy = y + dy * dist + py * featherOffset;
            const radius = 24 * (0.4 + 0.6 * Math.sin(i * 0.7));

            const grad = ctx.createRadialGradient(fx, fy, 1, fx, fy, radius);
            grad.addColorStop(0, 'rgba(240, 250, 255, 0.95)');
            grad.addColorStop(0.4, 'rgba(54, 224, 255, 0.5)');
            grad.addColorStop(1, 'rgba(255, 0, 127, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(fx, fy, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    },

    // Render Ultra Visual Overlays
    renderUltraPass: function(ctx, W, H) {
        if (this.mode === 2) { // Fantasy Mode
            const t = Date.now() * 0.0018;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 14; i++) {
                const fx = (Math.sin(t + i * 1.5) * 0.5 + 0.5) * W;
                const fy = (Math.cos(t * 1.2 + i * 1.8) * 0.5 + 0.5) * H;
                const col = ['rgba(54,224,255,0.3)', 'rgba(255,0,127,0.3)', 'rgba(255,211,58,0.3)'][i % 3];
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(fx, fy, 5 + Math.sin(t * 2 + i) * 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else if (this.mode === 3) { // Realistic PBR Mode
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
            ctx.fillRect(0, H - 20, W, 20); // Dynamic Ground Ambient Shadow
            ctx.restore();
        }
    }
};
