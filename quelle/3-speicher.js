// ===================================================================
// 3 · SPEICHER
// Highscore und Ton-Einstellung im Browser. Ist localStorage gesperrt (z. B. privater Modus),
// merkt sich das Spiel die Werte nur bis zum Neuladen – es läuft trotzdem.
// ===================================================================

const Speicher = (() => {
  const SCHLUESSEL = { rekord: 'froschsprung-rekord', ton: 'froschsprung-ton' };
  const notfall = {};

  function lies(name, standard) {
    const key = SCHLUESSEL[name];
    try {
      const wert = window.localStorage.getItem(key);
      if (wert !== null) return wert;
    } catch (e) { /* gesperrt */ }
    return key in notfall ? notfall[key] : standard;
  }

  function schreib(name, wert) {
    const key = SCHLUESSEL[name];
    notfall[key] = String(wert);
    try { window.localStorage.setItem(key, String(wert)); } catch (e) { /* gesperrt oder voll */ }
  }

  return {
    rekord() {
      const n = parseInt(lies('rekord', '0'), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    setzeRekord(n) { schreib('rekord', Math.floor(n)); },
    tonAn() { return lies('ton', '1') !== '0'; },
    setzeTon(an) { schreib('ton', an ? '1' : '0'); },
  };
})();
