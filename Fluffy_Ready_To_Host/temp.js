            this.save();
            const bgGrad = this.createLinearGradient(0, 0, 0, h);
            bgGrad.addColorStop(0, '#040014');
            bgGrad.addColorStop(1, '#1a0033');
            this.fillStyle = bgGrad;
            oldFillRect.call(this, 0, 0, w, h);
            this.strokeStyle = 'rgba(0, 255, 255, 0.08)';
            this.lineWidth = 2;
            this.beginPath();
            const gridSize = 60;
            const offset = (Date.now() / 20) % gridSize;
            for (let i = -offset; i < w; i += gridSize) { this.moveTo(i, 0); this.lineTo(i, h); }
            for (let j = -offset; j < h; j += gridSize) { this.moveTo(0, j); this.lineTo(w, j); }
            this.stroke();
            this.restore();
            return; 
        }

        if (w === 40 && h === 40 && sprites.wall.complete) {
            const fs = this.fillStyle;
            if (typeof fs === 'string' && fs.includes('rgb') && !fs.includes('255,60,60') && !fs.includes('rgba(220,30,40')) {
                this.drawImage(sprites.wall, x, y, 40, 40);
                return; 
            }
        }
        oldFillRect.call(this, x, y, w, h);
    };

    // 4. Hook into drawGame for Anime Girl Animations and Bloom
    if (window.drawGame) {
        const originalDraw = window.drawGame;
        window.drawGame = function() {
            originalDraw();
            
            if (window.state === 'game' && window.Fluffy && window.ctx) {
                const f = window.Fluffy;
                
                // Determine State Logic for the Anime Girl
                let action = 'idle';
                if (f.dead || f.hp <= 0) action = 'faint';
                else if (f.yv < -0.5) action = 'jump';
                else if (f.yv > 0.5) action = 'jump'; // falling
                else if (Math.abs(f.xv) > 0.5) action = 'walk';
                
                ctx.save();
                ctx.translate(f.x, f.y);
                
                // We add a warm outline glow to the character
                ctx.shadowBlur = 15;
                ctx.shadowColor = 'rgba(255, 200, 100, 0.8)';
                
                // Scale so she fits perfectly in the hitbox (which is normally 40x40)
                // Assuming images might be slightly larger, we draw at -25,-25 width 50 height 50
                let drawX = -25;
                let drawY = -30; // slightly shifted up
                let drawW = 50;
                let drawH = 50;

                let t = Date.now();

                if (action === 'idle' && sprites.down.complete) {
                    // IDLE: Down PNG, breathing (subtle scale Y bounce)
                    ctx.scale(1, 1 + Math.sin(t / 200) * 0.05);
                    ctx.drawImage(sprites.down, drawX, drawY, drawW, drawH);
                } 
                else if (action === 'walk' && sprites.side.complete) {
                    // WALK: Side PNG, facing direction, rotating and bobbing!
                    ctx.scale(f.facing || 1, 1);
                    ctx.rotate(Math.sin(t / 80) * 0.2); // tilt back and forth
                    ctx.drawImage(sprites.side, drawX, drawY - Math.abs(Math.cos(t / 80) * 5), drawW, drawH);
                }
                else if (action === 'jump' && sprites.up.complete) {
                    // JUMP: Up/Back PNG, squashed/stretched based on velocity
                    ctx.scale(f.facing || 1, 1);
                    if (f.yv < 0) {
                        ctx.scale(0.8, 1.2); // stretch going up
                    } else {
                        ctx.scale(1.1, 0.9); // squash falling
                    }
                    ctx.drawImage(sprites.up, drawX, drawY, drawW, drawH);
                }
                else if (action === 'faint' && sprites.down.complete) {
                    // FAINT: Down PNG rotated 90 degrees and flashing red
                    ctx.rotate(Math.PI / 2);
                    ctx.filter = (Math.floor(t / 100) % 2 === 0) ? 'sepia(1) hue-rotate(-50deg) saturate(5)' : 'none';
                    ctx.drawImage(sprites.down, drawX, drawY, drawW, drawH);
                }
                else {
                    // Fallback to idle if image is still loading
                    if (sprites.down.complete) ctx.drawImage(sprites.down, drawX, drawY, drawW, drawH);
                }
                
                ctx.restore();
            }

            // TRUE BLOOM PASS!
            if (glowCanvas.width > 0 && cv.width > 0 && glowCtx.filter) {
                glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
                glowCtx.filter = 'brightness(2.2) contrast(3.0) blur(8px)';
                glowCtx.globalCompositeOperation = 'source-over';
                glowCtx.drawImage(cv, 0, 0);
                glowCtx.filter = 'brightness(1.5) contrast(1.5) blur(24px)';
                glowCtx.globalCompositeOperation = 'screen';
                glowCtx.drawImage(cv, 0, 0);
                glowCtx.filter = 'none';
                glowCtx.globalCompositeOperation = 'source-over';
            }
        };
    }
})();
</script>

