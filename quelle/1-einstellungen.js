'use strict';
// ===================================================================
// 1 · EINSTELLUNGEN
// Alles, was man zum Abstimmen braucht, steht hier an einer Stelle:
// Raster, Zeiten, Punkte und die Spuren (Autos, Stämme, Seerosen) pro Level.
// Positionen und Längen sind in Kacheln angegeben, Tempo in Kacheln pro Sekunde.
// ===================================================================

const K = {
  SPALTEN: 11,
  REIHEN: 15,
  KACHEL_PIXEL: 16,          // so viele Bildpunkte hat eine Kachel in der Pixelgrafik

  // Reihen von oben (0) nach unten (14)
  ZIEL_REIHE: 0,
  UFER_REIHE: 1,
  FLUSS_REIHEN: [2, 3, 4, 5, 6],
  MITTEL_REIHEN: [7, 8],
  STRASSEN_REIHEN: [9, 10, 11, 12, 13],
  START_REIHE: 14,
  START_SPALTE: 5,
  ZIEL_SPALTEN: [1, 3, 5, 7, 9],

  START_LEBEN: 3,

  // Zeiten in Sekunden
  SCHRITT: 1 / 120,          // fester Simulationsschritt
  MAX_FRAME: 0.1,            // längere Pausen zwischen zwei Bildern werden gekappt
  SPRUNG_DAUER: 0.12,        // ein Hüpfer
  UNFALL_DAUER: 1.25,
  LEVELWECHSEL_DAUER: 2.2,
  ERSCHEINEN_DAUER: 0.3,

  // Fairness: Trefferflächen sind kleiner als die Bilder
  FROSCH_HALBBREITE: 0.3,    // Frosch-Trefferfläche: Mitte ± 0.3 Kacheln
  FAHRZEUG_RAND: 0.12,       // Fahrzeuge sind vorne und hinten um so viel kleiner
  TRAG_TOLERANZ: 0.1,        // auf Stamm oder Seerose, solange die Froschmitte höchstens so weit danebenliegt
  SEITEN_GRENZE: 0.35,       // seitliche Sprünge, die die Mitte näher an den Rand brächten, werden verhindert

  // Punkte
  PUNKTE_FELD: 10,
  PUNKTE_ZIEL: 200,
  PUNKTE_LEVEL: 1000,

  // Schwierigkeit: Tempo steigt pro Level, ist aber nach oben begrenzt
  TEMPO_PRO_LEVEL: 0.12,
  TEMPO_FAKTOR_MAX: 1.85,
  TEMPO_MAX_STRASSE: 3.6,
  TEMPO_MAX_FLUSS: 2.4,
};

// Gleichmäßig verteilte Gruppe von Dingen auf einer Spur
function gleichmaessig(anzahl, len, typ, spurLaenge) {
  const liste = [];
  for (let i = 0; i < anzahl; i++) liste.push({ x0: (i * spurLaenge) / anzahl, len, typ });
  return liste;
}

// Die Spuren. Pro Spur gibt es drei Stufen: Level 1–2, Level 3–4 und ab Level 5.
// L ist die Länge der unsichtbaren Rundstrecke: Was links hinausfährt, kommt erst
// außerhalb des Bildes wieder nach rechts. Benachbarte Spuren fahren immer gegenläufig.
const SPUR_PLAENE = [
  // ---- Straße ----
  { reihe: 13, art: 'strasse', richtung: -1, tempo: 1.0, stufen: [
    { L: 15, objekte: gleichmaessig(3, 1, 'auto', 15) },
    { L: 16, objekte: gleichmaessig(4, 1, 'auto', 16) },
    { L: 15, objekte: gleichmaessig(4, 1, 'auto', 15) },
  ] },
  { reihe: 12, art: 'strasse', richtung: 1, tempo: 0.8, stufen: [
    { L: 15, objekte: gleichmaessig(3, 1, 'traktor', 15) },
    { L: 14, objekte: gleichmaessig(3, 1, 'traktor', 14) },
    { L: 15, objekte: gleichmaessig(4, 1, 'traktor', 15) },
  ] },
  { reihe: 11, art: 'strasse', richtung: -1, tempo: 1.3, stufen: [
    { L: 16, objekte: [{ x0: 0, len: 1, typ: 'kaefer' }, { x0: 1.9, len: 1, typ: 'kaefer' }, { x0: 8, len: 1, typ: 'kaefer' }, { x0: 9.9, len: 1, typ: 'kaefer' }] },
    { L: 15, objekte: [{ x0: 0, len: 1, typ: 'kaefer' }, { x0: 1.9, len: 1, typ: 'kaefer' }, { x0: 7.5, len: 1, typ: 'kaefer' }, { x0: 9.4, len: 1, typ: 'kaefer' }] },
    { L: 18, objekte: [0, 1.8, 6, 7.8, 12, 13.8].map(x0 => ({ x0, len: 1, typ: 'kaefer' })) },
  ] },
  { reihe: 10, art: 'strasse', richtung: 1, tempo: 2.3, stufen: [
    { L: 16, objekte: gleichmaessig(2, 1, 'flitzer', 16) },
    { L: 14, objekte: gleichmaessig(2, 1, 'flitzer', 14) },
    { L: 18, objekte: gleichmaessig(3, 1, 'flitzer', 18) },
  ] },
  { reihe: 9, art: 'strasse', richtung: -1, tempo: 0.9, stufen: [
    { L: 19, objekte: [{ x0: 0, len: 3, typ: 'laster' }, { x0: 9, len: 2, typ: 'lieferwagen' }] },
    { L: 20, objekte: [{ x0: 0, len: 3, typ: 'laster' }, { x0: 7, len: 2, typ: 'lieferwagen' }, { x0: 13, len: 3, typ: 'laster' }] },
    { L: 19, objekte: [{ x0: 0, len: 3, typ: 'laster' }, { x0: 6.5, len: 2, typ: 'lieferwagen' }, { x0: 12.5, len: 3, typ: 'laster' }] },
  ] },

  // ---- Fluss ----
  { reihe: 6, art: 'fluss', richtung: -1, tempo: 0.9, stufen: [
    { L: 16, objekte: gleichmaessig(3, 3, 'seerosen', 16) },
    { L: 17, objekte: gleichmaessig(3, 3, 'seerosen', 17) },
    { L: 15, objekte: gleichmaessig(3, 2, 'seerosen', 15) },
  ] },
  { reihe: 5, art: 'fluss', richtung: 1, tempo: 1.2, stufen: [
    { L: 18, objekte: gleichmaessig(3, 4, 'stamm', 18) },
    { L: 18, objekte: gleichmaessig(3, 3, 'stamm', 18) },
    { L: 19, objekte: gleichmaessig(3, 3, 'stamm', 19) },
  ] },
  { reihe: 4, art: 'fluss', richtung: -1, tempo: 1.7, stufen: [
    { L: 18, objekte: gleichmaessig(2, 6, 'stamm', 18) },
    { L: 18, objekte: gleichmaessig(2, 5, 'stamm', 18) },
    { L: 19, objekte: gleichmaessig(2, 5, 'stamm', 19) },
  ] },
  { reihe: 3, art: 'fluss', richtung: 1, tempo: 1.0, stufen: [
    { L: 16, objekte: gleichmaessig(3, 3, 'seerosen', 16) },
    { L: 14, objekte: gleichmaessig(3, 2, 'seerosen', 14) },
    { L: 15, objekte: gleichmaessig(3, 2, 'seerosen', 15) },
  ] },
  { reihe: 2, art: 'fluss', richtung: -1, tempo: 1.4, stufen: [
    { L: 18, objekte: gleichmaessig(3, 4, 'stamm', 18) },
    { L: 19, objekte: gleichmaessig(3, 4, 'stamm', 19) },
    { L: 18, objekte: gleichmaessig(3, 3, 'stamm', 18) },
  ] },
];

function stufeFuerLevel(level) {
  return level <= 2 ? 0 : level <= 4 ? 1 : 2;
}

function tempoFaktor(level) {
  return Math.min(1 + K.TEMPO_PRO_LEVEL * (level - 1), K.TEMPO_FAKTOR_MAX);
}

// Baut die Spuren für ein Level als frische Datenobjekte
function baueSpuren(level) {
  const stufe = stufeFuerLevel(level);
  const faktor = tempoFaktor(level);
  return SPUR_PLAENE.map(plan => {
    const st = plan.stufen[stufe];
    const max = plan.art === 'strasse' ? K.TEMPO_MAX_STRASSE : K.TEMPO_MAX_FLUSS;
    return {
      reihe: plan.reihe,
      art: plan.art,
      richtung: plan.richtung,
      tempo: Math.min(plan.tempo * faktor, max),
      L: st.L,
      objekte: st.objekte.map(o => ({ x0: o.x0, len: o.len, typ: o.typ })),
      versatz: 0,
    };
  });
}
