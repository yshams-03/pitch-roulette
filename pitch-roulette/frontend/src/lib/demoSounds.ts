/** Subtle Web Audio cues for demo match events. */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType, gain = 0.06) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export function playDemoEventSound(eventType: string) {
  if (eventType.includes('GOAL')) {
    tone(523, 0.12, 'sine', 0.07);
    setTimeout(() => tone(659, 0.18, 'sine', 0.06), 90);
    return;
  }
  if (eventType.includes('RED')) {
    tone(180, 0.25, 'square', 0.04);
    return;
  }
  if (eventType.includes('YELLOW')) {
    tone(440, 0.1, 'triangle', 0.05);
    return;
  }
  if (eventType.includes('PENALTY')) {
    tone(330, 0.08, 'sine', 0.05);
    setTimeout(() => tone(392, 0.12, 'sine', 0.05), 70);
  }
}
