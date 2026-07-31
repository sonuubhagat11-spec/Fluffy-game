class NekoLang {
    constructor() {
        this.variables = {};
    }
    
    run(code) {
        const screen = document.getElementById('game_screen');
        if (screen) screen.innerHTML = '';
        
        const lines = code.split('\n');
        let output = [];
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('//')) continue;
            
            if (line.startsWith('print ')) {
                let val = line.substring(6).trim();
                output.push(this.variables[val] !== undefined ? this.variables[val] : val);
            } else if (line.startsWith('load_model ')) {
                let model = line.substring(11).trim();
                output.push(`[Model Importer] Loaded 3D model: ${model}`);
                if (screen) {
                    let el = document.createElement('div');
                    el.style.width = '100px';
                    el.style.height = '100px';
                    el.style.backgroundColor = '#4caf50';
                    el.style.position = 'absolute';
                    el.style.top = '50%';
                    el.style.left = '50%';
                    el.style.transform = 'translate(-50%, -50%)';
                    el.style.borderRadius = '10px';
                    el.style.display = 'flex';
                    el.style.alignItems = 'center';
                    el.style.justifyContent = 'center';
                    el.style.color = 'white';
                    el.style.fontWeight = 'bold';
                    el.innerText = model;
                    el.id = 'model_el';
                    screen.appendChild(el);
                }
            } else if (line.startsWith('anime_effect ')) {
                let effect = line.substring(13).trim();
                output.push(`[Anime FX] Triggered effect: ${effect}`);
                if (screen) {
                    let el = document.getElementById('model_el');
                    if (el) {
                        el.style.boxShadow = '0 0 50px 20px #ffeb3b';
                        el.style.border = '4px solid #ff9800';
                        el.style.animation = 'shake 0.5s infinite';
                    }
                }
            } else if (line.includes('=')) {
                let parts = line.split('=');
                let name = parts[0].trim();
                let val = parts[1].trim();
                this.variables[name] = val;
                output.push(`[Variable] ${name} set`);
            } else {
                output.push(`[Error] Unknown command: ${line}`);
            }
        }
        return output.join('\n');
    }
}
