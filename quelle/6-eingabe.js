// ===================================================================
// 6 · EINGABE
// Tastatur (Pfeile, WASD, P/Esc), Wischen auf dem Spielfeld und das Steuerkreuz.
// Jede Geste und jeder Tastendruck löst höchstens einen Sprung aus.
// Scrollen und Browsergesten werden nur auf Spielfeld und Steuerkreuz verhindert.
// ===================================================================

const Eingabe = (() => {
  const TASTEN = {
    ArrowUp: 'hoch', KeyW: 'hoch',
    ArrowDown: 'runter', KeyS: 'runter',
    ArrowLeft: 'links', KeyA: 'links',
    ArrowRight: 'rechts', KeyD: 'rechts',
  };
  const BUCHSTABEN = { w: 'hoch', s: 'runter', a: 'links', d: 'rechts' };

  let eingerichtet = false;

  function init({ canvas, steuer, beiRichtung, beiPause, spielAktiv, kachelBreite, beiTouch }) {
    if (eingerichtet) return;   // nie doppelte Listener
    eingerichtet = true;

    // ---------- Tastatur ----------
    const gedrueckt = new Set();
    window.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ziel = e.target;
      if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA')) return;

      if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (e.repeat) return;
        if (beiPause()) e.preventDefault();
        return;
      }
      const richtung = TASTEN[e.code] || BUCHSTABEN[(e.key || '').toLowerCase()];
      if (!richtung || !spielAktiv()) return;
      e.preventDefault();             // kein Seitenscrollen durch Spieltasten
      const id = e.code || e.key;
      if (e.repeat || gedrueckt.has(id)) return;   // gehaltene Taste = nur ein Sprung
      gedrueckt.add(id);
      beiRichtung(richtung);
    });
    window.addEventListener('keyup', e => { gedrueckt.delete(e.code || e.key); });
    window.addEventListener('blur', () => gedrueckt.clear());

    // ---------- Browsergesten nur auf den Spielflächen blockieren ----------
    const blockiere = e => { if (e.cancelable) e.preventDefault(); };
    for (const el of [canvas, steuer]) {
      el.addEventListener('touchstart', blockiere, { passive: false });
      el.addEventListener('touchmove', blockiere, { passive: false });
      el.addEventListener('touchend', blockiere, { passive: false });
      el.addEventListener('dblclick', blockiere);
      el.addEventListener('contextmenu', blockiere);
    }

    // ---------- Wischen auf dem Spielfeld ----------
    let wisch = null;
    const schwelle = () => Math.max(18, Math.min(36, kachelBreite() * 0.6));
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') beiTouch();
      if (e.button > 0) return;
      wisch = { id: e.pointerId, x: e.clientX, y: e.clientY, fertig: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    });
    const pruefeWisch = e => {
      if (!wisch || wisch.id !== e.pointerId || wisch.fertig) return;
      const dx = e.clientX - wisch.x;
      const dy = e.clientY - wisch.y;
      if (Math.hypot(dx, dy) < schwelle()) return;   // kleine Fingerbewegung: kein Wischen
      wisch.fertig = true;                             // eine Geste = ein Sprung
      const richtung = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'rechts' : 'links') : (dy > 0 ? 'runter' : 'hoch');
      if (spielAktiv()) beiRichtung(richtung);
    };
    canvas.addEventListener('pointermove', pruefeWisch);
    canvas.addEventListener('pointerup', e => { pruefeWisch(e); if (wisch && wisch.id === e.pointerId) wisch = null; });
    canvas.addEventListener('pointercancel', () => { wisch = null; });

    // ---------- Steuerkreuz ----------
    for (const knopf of steuer.querySelectorAll('[data-richtung]')) {
      const richtung = knopf.dataset.richtung;
      knopf.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') beiTouch();
        if (e.button > 0) return;
        e.preventDefault();
        knopf.classList.add('gedrueckt');
        if (spielAktiv()) beiRichtung(richtung);
      });
      const los = () => knopf.classList.remove('gedrueckt');
      knopf.addEventListener('pointerup', los);
      knopf.addEventListener('pointercancel', los);
      knopf.addEventListener('pointerleave', los);
      // Nur Tastatur-Klicks (Enter/Leertaste haben detail 0); Zeiger-Klicks liefen schon über pointerdown
      knopf.addEventListener('click', e => {
        if (e.detail === 0 && spielAktiv()) beiRichtung(richtung);
      });
    }
  }

  return { init };
})();
