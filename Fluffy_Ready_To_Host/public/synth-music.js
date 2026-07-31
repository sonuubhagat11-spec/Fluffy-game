/**
 * Fluffy Doghy - Code-Generated Synth Music
 * A procedural chiptune engine using the Web Audio API.
 */

window.FluffySynth = (function() {
  let actx = null;
  let isPlaying = false;
  let nextNoteTime = 0;
  let current16thNote = 0;
  let scheduleTimer = null;
  
  const tempo = 130; // BPM
  const lookahead = 25.0; // ms
  const scheduleAheadTime = 0.1; // seconds
  
  // A minor pentatonic scale + some passing notes for a funky, energetic feel
  // Notes are MIDI note numbers
  const melodyPattern = [69, 72, 74, 69, 0, 76, 74, 72, 69, 0, 74, 72, 69, 67, 69, 0];
  const bassPattern   = [45, 0, 45, 0, 45, 45, 0, 48, 50, 0, 50, 0, 50, 50, 0, 43];
  
  // Utility: Convert MIDI note to frequency
  function m2f(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  
  function playNote(midiNote, time, type = 'square', duration = 0.1, vol = 0.1) {
    if (midiNote === 0) return; // Rest
    
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(m2f(midiNote), time);
    
    // Envelope
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    
    osc.connect(gain);
    gain.connect(actx.destination);
    
    osc.start(time);
    osc.stop(time + duration);
  }
  
  function playDrum(time) {
    // Simple kick drum using a rapidly dropping sine wave
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    
    osc.connect(gain);
    gain.connect(actx.destination);
    
    osc.start(time);
    osc.stop(time + 0.5);
  }
  
  function playHihat(time) {
    // We'd ideally use a buffer of noise, but for pure synth, we can use a high frequency square wave burst
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(8000, time);
    
    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    
    // Simple highpass by filtering out lows isn't strictly necessary for a crude hihat
    osc.connect(gain);
    gain.connect(actx.destination);
    
    osc.start(time);
    osc.stop(time + 0.05);
  }

  function scheduleNote(beatNumber, time) {
    // Play Drums
    if (beatNumber % 4 === 0) {
      playDrum(time); // Kick on the beat
    }
    if (beatNumber % 2 !== 0) {
      playHihat(time); // Hihats on the offbeats
    }
    
    // Play Bass
    playNote(bassPattern[beatNumber % bassPattern.length], time, 'triangle', 0.15, 0.3);
    
    // Play Melody
    // Shift melody slightly higher on the 3rd and 4th bar
    const bar = Math.floor(beatNumber / 16);
    let shift = (bar % 4 >= 2) ? 5 : 0; 
    
    const melNote = melodyPattern[beatNumber % melodyPattern.length];
    playNote(melNote > 0 ? melNote + shift : 0, time, 'square', 0.1, 0.15);
  }

  function nextNote() {
    const secondsPerBeat = 60.0 / tempo;
    nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
    current16thNote++;
    if (current16thNote === 64) {
      current16thNote = 0;
    }
  }

  function scheduler() {
    while (nextNoteTime < actx.currentTime + scheduleAheadTime) {
      scheduleNote(current16thNote, nextNoteTime);
      nextNote();
    }
    scheduleTimer = setTimeout(scheduler, lookahead);
  }

  return {
    toggle: function() {
      if (isPlaying) {
        clearTimeout(scheduleTimer);
        isPlaying = false;
        if (actx) {
          actx.close();
          actx = null;
        }
        return false;
      } else {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        isPlaying = true;
        current16thNote = 0;
        nextNoteTime = actx.currentTime + 0.05;
        scheduler();
        return true;
      }
    }
  };
})();
