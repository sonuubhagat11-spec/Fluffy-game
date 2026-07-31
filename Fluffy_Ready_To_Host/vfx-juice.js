// Fluffy Juiciness & VFX Engine 🐶✨
window.FluffyVFX = {
    particles: [],
    trails: [],
    shakeTime: 0,
    shakeIntensity: 0,

    init: function() {
        this.particles = [];
        this.trails = [];
    },

    triggerShake: function(duration, intensity) {
        this.shakeTime = duration;
        this.shakeIntensity = intensity;
    },

    spawnBurst: function(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03,
                size: 2 + Math.random() * 4,
                color: color || '#ff007f'
            });
        }
    },

    spawnFeather: function(x, y, vx, vy) {
        // Spawn feather particles for the ghost buster beam
        this.particles.push({
            x: x,
            y: y,
            vx: vx + (Math.random() - 0.5) * 2,
            vy: vy + (Math.random() - 0.5) * 2,
            life: 1.0,
            decay: 0.04,
            size: 3 + Math.random() * 5,
            color: '#ffffff',
            isFeather: true,
            rot: Math.random() * Math.PI * 2,
            rotVel: (Math.random() - 0.5) * 0.1
        });
    },

    addTrail: function(x, y, w, h, facingLeft) {
        this.trails.push({
            x: x,
            y: y,
            w: w,
            h: h,
            facingLeft: facingLeft,
            alpha: 0.6
        });
    },

    update: function() {
        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.isFeather) {
                p.rot += p.rotVel;
                // Feather drift (swaying)
                p.vx += Math.sin(Date.now() * 0.01) * 0.05;
            }
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update trails
        for (let i = this.trails.length - 1; i >= 0; i--) {
            const t = this.trails[i];
            t.alpha -= 0.05;
            if (t.alpha <= 0) {
                this.trails.splice(i, 1);
            }
        }

        // Update screen shake
        if (this.shakeTime > 0) {
            this.shakeTime--;
        }
    },

    applyShake: function(ctx) {
        if (this.shakeTime > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            ctx.translate(dx, dy);
        }
    },

    draw: function(ctx) {
        // Draw trails
        this.trails.forEach(t => {
            ctx.save();
            ctx.globalAlpha = t.alpha;
            ctx.fillStyle = 'rgba(54, 224, 255, 0.4)'; // Cyan trail
            ctx.fillRect(t.x, t.y, t.w, t.h);
            ctx.restore();
        });

        // Draw particles
        this.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;

            if (p.isFeather) {
                // Draw a simple feather shape
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.beginPath();
                ctx.ellipse(0, 0, p.size * 1.5, p.size * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
            }
            ctx.restore();
        });
    },

    drawGhostBusterBeam: function(ctx, sx, sy, tx, ty) {
        // Synthesize feathery beam
        ctx.save();
        
        // Base core beam
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#36e0ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // Cool feather overlay/sine wave
        ctx.strokeStyle = 'rgba(54, 224, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const steps = 20;
        const dx = (tx - sx) / steps;
        const dy = (ty - sy) / steps;
        ctx.moveTo(sx, sy);
        for(let i = 1; i <= steps; i++) {
            const px = sx + dx * i;
            const py = sy + dy * i;
            const offset = Math.sin(i * 0.8 + Date.now() * 0.02) * 8;
            // Get normal vector
            const len = Math.sqrt(dx*dx + dy*dy);
            const nx = -dy / len;
            const ny = dx / len;
            ctx.lineTo(px + nx * offset, py + ny * offset);
        }
        ctx.stroke();

        // Spawn feathery drift particles along the beam
        if (Math.random() < 0.3) {
            const t = Math.random();
            const px = sx + (tx - sx) * t;
            const py = sy + (ty - sy) * t;
            this.spawnFeather(px, py, (tx - sx) * 0.01, (ty - sy) * 0.01);
        }

        ctx.restore();
    }
};
