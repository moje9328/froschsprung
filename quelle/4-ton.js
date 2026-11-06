// ===================================================================
// 4 · TON
// Kurze, selbst erzeugte Retro-Töne mit der Web-Audio-Schnittstelle. Keine Audiodateien.
// Der Ton startet erst nach einer Nutzeraktion (Browser-Regel).
// ===================================================================

const Ton = (() => {
  let ctx = null;
  let haupt = null;
  let an = true;
  let rauschen = null;

  function wecke() {
    if (!an) return;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        haupt = ctx.createGain();
        haupt.gain.value = 0.32;
        haupt.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { ctx = null; }
  }

  function bereit() {
    return an && ctx && ctx.state === 'running';
  }

  // Ein Ton mit Rechteck- oder Dreieckwelle, Tonhöhe gleitet von f1 nach f2
  function piep(f1, f2, dauer, { typ = 'square', laut = 0.5, start = 0 } = {}) {
    if (!bereit()) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = typ;
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dauer);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(laut, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    osc.connect(g).connect(haupt);
    osc.start(t);
    osc.stop(t + dauer + 0.02);
  }

  function krach(dauer, { laut = 0.5, start = 0, filter = 1200 } = {}) {
    if (!bereit()) return;
    if (!rauschen) {
      rauschen = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = rauschen.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = rauschen;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(filter, t);
    bp.frequency.exponentialRampToValueAtTime(120, t + dauer);
    const g = ctx.createGain();
    g.gain.setValueAtTime(laut, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    src.connect(bp).connect(g).connect(haupt);
    src.start(t);
    src.stop(t + dauer + 0.02);
  }

  return {
    wecke,
    istAn: () => an,
    setze(wert, wecken) {
      an = wert;
      if (an && wecken) wecke();
      else if (!an && ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },
    sprung() { piep(330, 660, 0.07, { laut: 0.22 }); },
    blockiert() { piep(140, 110, 0.08, { typ: 'triangle', laut: 0.4 }); },
    ziel() {
      [523, 659, 784, 1047].forEach((f, i) => piep(f, f, 0.09, { laut: 0.25, start: i * 0.07 }));
    },
    auto() {
      krach(0.35, { laut: 0.55, filter: 2400 });
      piep(300, 60, 0.35, { laut: 0.3 });
    },
    wasser() {
      krach(0.5, { laut: 0.45, filter: 900 });
      piep(500, 120, 0.3, { typ: 'triangle', laut: 0.35, start: 0.02 });
    },
    level() {
      const noten = [392, 523, 659, 784, 659, 784, 1047];
      noten.forEach((f, i) => piep(f, f, 0.12, { laut: 0.24, start: i * 0.11 }));
    },
    ende() {
      [392, 330, 262, 196].forEach((f, i) => piep(f, f * 0.97, 0.2, { typ: 'triangle', laut: 0.45, start: i * 0.18 }));
    },
  };
})();
