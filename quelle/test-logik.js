// Prüft die Spielregeln ohne Browser. Aufruf: node quelle/test-logik.js
// (Optional: node quelle/test-logik.js schnell  → ohne den langen Bot-Lauf)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ordner = __dirname;
const code = ['1-einstellungen.js', '2-logik.js'].map(n => fs.readFileSync(path.join(ordner, n), 'utf8')).join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code + '\n;this.api = { K, SPUR_PLAENE, ZUSTAND, erstelleSpiel, neuStart, eingabe, schritt, pausiere, setzeFort, objektX, objekteInSpur, spurInReihe, plattformUnter, fahrzeugTrifft, baueSpuren, istFluss, istStrasse, tempoFaktor };', ctx);
const { K, SPUR_PLAENE, ZUSTAND, erstelleSpiel, neuStart, eingabe, schritt, pausiere, setzeFort, objektX, spurInReihe, plattformUnter, fahrzeugTrifft, baueSpuren, istFluss, istStrasse, tempoFaktor } = ctx.api;

let fehler = 0;
let ok = 0;
function pruefe(bedingung, text) {
  if (bedingung) { ok++; } else { fehler++; console.log('  FEHLER:', text); }
}
function abschnitt(name) { console.log('• ' + name); }

const dt = K.SCHRITT;
function laufe(s, sekunden) { const n = Math.round(sekunden / dt); for (let i = 0; i < n; i++) schritt(s, dt); }
function bisGelandet(s) { let n = 0; while (s.frosch.sprung && n++ < 1000) schritt(s, dt); }
function ereignisse(s) { const e = s.ereignisse.slice(); s.ereignisse.length = 0; return e; }

// Setzt die Spur so, dass Objekt i mit der linken Kante bei x steht
function setzeObjekt(s, reihe, i, x) {
  const spur = spurInReihe(s, reihe);
  spur.versatz = x + (spur.L - K.SPALTEN) - spur.objekte[i].x0;
}
// Hält Spuren an (Tempo 0), damit Einzelfälle exakt prüfbar sind
function stoppeSpuren(s) { for (const sp of s.spuren) sp.tempo = 0; }
function neu() { const s = erstelleSpiel(); neuStart(s); ereignisse(s); return s; }
// Alle Autos weit weg schieben (Spur anhalten, Objekte außerhalb)
function strasseFrei(s) {
  for (const r of K.STRASSEN_REIHEN) {
    const sp = spurInReihe(s, r);
    sp.tempo = 0;
    // Objekte sind ab Position x0+versatz verteilt; wir schieben alle in den unsichtbaren Bereich
    sp.objekte = sp.objekte.map(o => ({ ...o }));
    sp.objekte.forEach(o => { o.x0 = 0; });
    sp.versatz = -sp.objekte[0].len - 0.5 + (sp.L - K.SPALTEN);   // linke Kante bei -len-0.5
  }
}

// ---------------------------------------------------------------
abschnitt('Aufbau der Spuren');
for (let level = 1; level <= 12; level++) {
  const spuren = baueSpuren(level);
  pruefe(spuren.length === 10, 'zehn Spuren');
  for (const sp of spuren) {
    const maxLen = Math.max(...sp.objekte.map(o => o.len));
    pruefe(sp.L >= K.SPALTEN + maxLen, `Reihe ${sp.reihe}: Rundstrecke lang genug für Umlauf außerhalb des Bildes`);
    // Objekte überlappen sich nicht
    const xs = sp.objekte.map(o => [o.x0, o.x0 + o.len]).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < xs.length; i++) {
      const naechster = i + 1 < xs.length ? xs[i + 1][0] : xs[0][0] + sp.L;
      pruefe(naechster - xs[i][1] >= 0.5, `Reihe ${sp.reihe}: Abstand zwischen Objekten`);
    }
    const max = sp.art === 'strasse' ? K.TEMPO_MAX_STRASSE : K.TEMPO_MAX_FLUSS;
    pruefe(sp.tempo <= max + 1e-9, `Reihe ${sp.reihe}: Tempo begrenzt`);
  }
  // Benachbarte Spuren gegenläufig und unterschiedlich schnell
  const nach = {};
  spuren.forEach(sp => { nach[sp.reihe] = sp; });
  for (const gruppe of [K.STRASSEN_REIHEN, K.FLUSS_REIHEN]) {
    for (let i = 0; i + 1 < gruppe.length; i++) {
      const a = nach[gruppe[i]], b = nach[gruppe[i + 1]];
      pruefe(a.richtung !== b.richtung, `Reihen ${a.reihe}/${b.reihe} gegenläufig`);
      pruefe(Math.abs(a.tempo - b.tempo) > 0.05, `Reihen ${a.reihe}/${b.reihe} unterschiedlich schnell (Level ${level})`);
    }
  }
}
pruefe(tempoFaktor(50) === K.TEMPO_FAKTOR_MAX, 'Tempo wächst nicht unbegrenzt');
pruefe(K.REIHEN === 1 + K.STRASSEN_REIHEN.length + K.MITTEL_REIHEN.length + K.FLUSS_REIHEN.length + 1 + 1, '15 Reihen wie geplant');

// Faire Straße: Lücke, durch die man in Ruhe hüpfen kann (mind. 0.5 s frei an einer Stelle)
for (let level = 1; level <= 12; level++) {
  for (const sp of baueSpuren(level).filter(x => x.art === 'strasse')) {
    const xs = sp.objekte.map(o => [o.x0, o.x0 + o.len]).sort((a, b) => a[0] - b[0]);
    let groessteLuecke = 0;
    for (let i = 0; i < xs.length; i++) {
      const naechster = i + 1 < xs.length ? xs[i + 1][0] : xs[0][0] + sp.L;
      groessteLuecke = Math.max(groessteLuecke, naechster - xs[i][1]);
    }
    // Der Frosch braucht (Breite + Ränder) frei: Zeit = (Lücke − 0.6 + 0.24) / Tempo
    const zeit = (groessteLuecke - 2 * K.FROSCH_HALBBREITE + 2 * K.FAHRZEUG_RAND) / sp.tempo;
    pruefe(zeit >= 0.5, `Level ${level} Reihe ${sp.reihe}: größte Lücke lässt ${zeit.toFixed(2)} s Zeit`);
  }
}

// ---------------------------------------------------------------
abschnitt('Bewegung: genau eine Kachel, Puffer höchstens ein Sprung');
{
  const s = neu();
  strasseFrei(s);
  eingabe(s, 'rechts');
  bisGelandet(s);
  pruefe(Math.abs(s.frosch.x - 6.5) < 1e-9 && s.frosch.reihe === 14, 'rechts = genau eine Spalte');
  eingabe(s, 'hoch');
  bisGelandet(s);
  pruefe(s.frosch.reihe === 13 && Math.abs(s.frosch.x - 6.5) < 1e-9, 'hoch = genau eine Reihe');
  // Fünfmal schnell hintereinander: nur der laufende + ein gemerkter Sprung
  ereignisse(s);
  for (let i = 0; i < 5; i++) eingabe(s, 'hoch');
  laufe(s, 0.6);
  const spruenge = ereignisse(s).filter(e => e.typ === 'sprung').length;
  pruefe(spruenge === 2, `5 Eingaben während eines Sprungs → ${spruenge} Sprünge (erwartet 2)`);
  pruefe(s.frosch.reihe === 11, 'Frosch steht danach zwei Reihen weiter');
  // Sprungdauer
  eingabe(s, 'hoch');
  let n = 0;
  while (s.frosch.sprung) { schritt(s, dt); n++; }
  const ms = n * dt * 1000;
  pruefe(ms >= 100 && ms <= 140, `Sprung dauert ${ms.toFixed(0)} ms`);
  // Rückwärts aus der Startreihe geht nicht
  const t = neu();
  pruefe(eingabe(t, 'runter') === false && t.frosch.reihe === 14, 'nicht unter die Startreihe');
  // Seitlich am Rand: blockiert, kein Leben weg
  const r = neu();
  strasseFrei(r);
  for (let i = 0; i < 8; i++) { eingabe(r, 'links'); bisGelandet(r); }
  pruefe(r.frosch.x === 0.5 && r.leben === 3 && r.zustand === ZUSTAND.SPIELEN, 'am linken Rand gestoppt, ohne Leben zu verlieren');
}

// ---------------------------------------------------------------
abschnitt('Straße: faire Zusammenstöße');
{
  // Auto steht knapp neben dem Frosch: sichtbar berührt, aber Trefferfläche kleiner
  const s = neu();
  stoppeSpuren(s);
  strasseFrei(s);
  const sp = spurInReihe(s, 13);
  sp.objekte = [{ x0: 0, len: 1, typ: 'auto' }];
  // Frosch landet bei x=5.5 (Trefferfläche 5.2..5.8). Auto 6.05..7.05 → Trefferfläche 6.17..6.93 → kein Treffer
  setzeObjekt(s, 13, 0, 6.05);
  eingabe(s, 'hoch'); bisGelandet(s);
  pruefe(s.zustand === ZUSTAND.SPIELEN && s.frosch.reihe === 13, 'knapp daneben überlebt');
  // Auto überlappt die Trefferfläche
  setzeObjekt(s, 13, 0, 5.6);
  laufe(s, dt * 2);
  pruefe(s.zustand === ZUSTAND.UNFALL && s.unfall.art === 'auto', 'Treffer erkannt');
  // Genau ein Leben weg, auch wenn das Auto weiter über den Frosch fährt
  laufe(s, 0.5);
  pruefe(s.leben === 2, 'pro Unfall genau ein Leben');
  laufe(s, K.UNFALL_DAUER);
  pruefe(s.zustand === ZUSTAND.SPIELEN && s.frosch.reihe === 14 && s.frosch.x === 5.5, 'Neustart unten in der Mitte');
  pruefe(s.leben === 2, 'immer noch 2 Leben');

  // In ein fahrendes Auto hineinspringen
  const t = neu();
  strasseFrei(t);
  const sp2 = spurInReihe(t, 13);
  sp2.objekte = [{ x0: 0, len: 1, typ: 'auto' }];
  setzeObjekt(t, 13, 0, 5.2);
  eingabe(t, 'hoch'); bisGelandet(t);
  laufe(t, 0.05);
  pruefe(t.zustand === ZUSTAND.UNFALL, 'Sprung auf ein Auto kostet ein Leben');
}

// ---------------------------------------------------------------
abschnitt('Fluss: mitfahren, Wasser, Rand, Umlauf');
function froschAufFluss(s, reihe, x) {
  s.frosch.reihe = reihe;
  s.frosch.x = x;
  s.frosch.sprung = null;
  s.rundeBeste = reihe;
}
{
  // Mitfahren mit der echten Bewegung
  const s = neu();
  const sp = spurInReihe(s, 5);    // Stämme nach rechts
  setzeObjekt(s, 5, 0, 2);         // Stamm 2..6
  froschAufFluss(s, 5, 3.5);
  const v = sp.richtung * sp.tempo;
  laufe(s, 1);
  pruefe(s.zustand === ZUSTAND.SPIELEN, 'auf dem Stamm sicher');
  pruefe(Math.abs(s.frosch.x - (3.5 + v)) < 0.02, `fährt mit (x=${s.frosch.x.toFixed(3)}, erwartet ${(3.5 + v).toFixed(3)})`);
  const relativ = s.frosch.x - objektX(sp, sp.objekte[0]);
  pruefe(Math.abs(relativ - 1.5) < 0.02, 'bleibt an derselben Stelle auf dem Stamm');

  // Ins Wasser springen
  const w = neu();
  stoppeSpuren(w);
  setzeObjekt(w, 5, 0, 2); setzeObjekt(w, 4, 0, 20);  // Reihe 4 leer im Bild
  spurInReihe(w, 4).objekte.forEach(o => { o.x0 = 0; });
  spurInReihe(w, 4).versatz = -7 + (spurInReihe(w, 4).L - 11);
  froschAufFluss(w, 5, 3.5);
  eingabe(w, 'hoch'); bisGelandet(w);
  pruefe(w.zustand === ZUSTAND.UNFALL && w.unfall.art === 'wasser', 'Sprung ins Wasser = Unfall');
  pruefe(w.leben === 2, 'ein Leben weg');

  // Seitlich hinausgetragen, ohne Teleport am Umlaufpunkt
  const r = neu();
  setzeObjekt(r, 5, 0, 7);         // Stamm 7..11 (Länge 4), fährt nach rechts
  froschAufFluss(r, 5, 10.0);
  let letzteX = r.frosch.x, maxSprung = 0, schritte = 0;
  while (r.zustand === ZUSTAND.SPIELEN && schritte++ < 2000) {
    schritt(r, dt);
    maxSprung = Math.max(maxSprung, Math.abs(r.frosch.x - letzteX));
    letzteX = r.frosch.x;
  }
  pruefe(r.zustand === ZUSTAND.UNFALL && r.unfall.art === 'abgetrieben', 'am rechten Rand hinausgetragen = Unfall');
  pruefe(maxSprung < 0.05, `kein Teleport (größter Schritt ${maxSprung.toFixed(3)} Kacheln)`);
  pruefe(r.frosch.x > 10.9 && r.frosch.x < 11.1, 'Unfall genau am Rand');

  // Linker Rand, Spur nach links
  const l = neu();
  setzeObjekt(l, 4, 0, -1);        // langer Stamm -1..5, fährt nach links
  froschAufFluss(l, 4, 1.0);
  for (let i = 0; i < 300 && l.zustand === ZUSTAND.SPIELEN; i++) schritt(l, dt);
  pruefe(l.zustand === ZUSTAND.UNFALL && l.unfall.art === 'abgetrieben' && l.unfall.x < 0.05, 'am linken Rand hinausgetragen');

  // Seitwärts hüpfen auf dem Stamm: Bewegung + Schwung werden mitgenommen
  const q = neu();
  const sq = spurInReihe(q, 5);
  setzeObjekt(q, 5, 0, 1);         // Stamm 1..5
  froschAufFluss(q, 5, 2.5);
  const start = objektX(sq, sq.objekte[0]);
  eingabe(q, 'rechts'); bisGelandet(q);
  const rel = q.frosch.x - objektX(sq, sq.objekte[0]);
  pruefe(q.zustand === ZUSTAND.SPIELEN, 'seitlich auf dem Stamm gelandet');
  pruefe(Math.abs(rel - 2.5) < 0.03, `landet genau eine Kachel weiter auf dem Stamm (relativ ${rel.toFixed(3)}, Start ${start})`);

  // Von Stamm zu Stamm springen (gegenläufige Spuren)
  const z = neu();
  setzeObjekt(z, 5, 0, 3);         // Reihe 5: 3..7 nach rechts
  setzeObjekt(z, 4, 0, 2);         // Reihe 4: 2..8 nach links
  froschAufFluss(z, 5, 5.0);
  eingabe(z, 'hoch'); bisGelandet(z);
  pruefe(z.zustand === ZUSTAND.SPIELEN && z.frosch.reihe === 4, 'Wechsel auf den gegenläufigen Stamm');
  laufe(z, 0.3);
  pruefe(z.zustand === ZUSTAND.SPIELEN, 'fährt danach mit dem neuen Stamm');
  const sz = spurInReihe(z, 4);
  const relZ = z.frosch.x - objektX(sz, sz.objekte[0]);
  laufe(z, 0.5);
  pruefe(Math.abs(z.frosch.x - objektX(sz, sz.objekte[0]) - relZ) < 0.02, 'bleibt relativ zum neuen Stamm stehen');

  // Am Plattformende ins Wasser
  const e = neu();
  stoppeSpuren(e);
  setzeObjekt(e, 5, 0, 1);         // Stamm 1..5
  froschAufFluss(e, 5, 4.5);
  eingabe(e, 'rechts'); bisGelandet(e);
  pruefe(e.zustand === ZUSTAND.UNFALL && e.unfall.art === 'wasser', 'vom Stammende ins Wasser');

  // Mittelstreifen vom Stamm aus: Frosch landet mittig in einer Kachel
  const m = neu();
  setzeObjekt(m, 6, 0, 2);         // Seerosen 2..5
  froschAufFluss(m, 6, 3.3);
  eingabe(m, 'runter'); bisGelandet(m);
  pruefe(m.frosch.reihe === 7 && m.frosch.x === 3.5, `auf festem Boden mittig (x=${m.frosch.x})`);
  pruefe(m.zustand === ZUSTAND.SPIELEN, 'Mittelstreifen ist sicher');
}

// ---------------------------------------------------------------
abschnitt('Ziele, Level, Punkte');
function setzeUfer(s, spalte) {
  s.frosch.reihe = 1; s.frosch.x = spalte + 0.5; s.frosch.sprung = null; s.rundeBeste = 1;
}
{
  const s = neu();
  const vorher = s.punkte;
  setzeUfer(s, 3);
  eingabe(s, 'hoch'); bisGelandet(s);
  const e = ereignisse(s);
  pruefe(s.ziele[1] === true, 'Zielfeld Spalte 3 besetzt');
  pruefe(e.some(x => x.typ === 'ziel'), 'Ziel-Ereignis');
  pruefe(s.punkte === vorher + K.PUNKTE_FELD + K.PUNKTE_ZIEL, `Zielbonus (${s.punkte - vorher})`);
  pruefe(s.frosch.reihe === 14 && s.frosch.x === 5.5, 'danach wieder unten');
  // Besetztes Ziel: gesperrt, kein Leben weg
  setzeUfer(s, 3);
  const leben = s.leben;
  pruefe(eingabe(s, 'hoch') === false, 'besetztes Ziel gesperrt');
  laufe(s, 0.3);
  pruefe(s.frosch.reihe === 1 && s.leben === leben && s.zustand === ZUSTAND.SPIELEN, 'kein Lebensverlust am besetzten Ziel');
  // Hecke zwischen Zielen
  setzeUfer(s, 4);
  pruefe(eingabe(s, 'hoch') === false && s.leben === leben, 'Hecke gesperrt ohne Lebensverlust');
  // Alle Ziele → Level 2
  for (const sp of [1, 5, 7, 9]) { setzeUfer(s, sp); eingabe(s, 'hoch'); bisGelandet(s); }
  pruefe(s.zustand === ZUSTAND.LEVELWECHSEL, 'Levelwechsel nach fünf Zielen');
  const punkteVorLevel = s.punkte;
  laufe(s, K.LEVELWECHSEL_DAUER + 0.1);
  pruefe(s.level === 2 && s.zustand === ZUSTAND.SPIELEN && s.ziele.every(z => !z), 'Level 2, Ziele wieder frei');
  pruefe(s.punkte === punkteVorLevel, 'Levelbonus wurde einmal gutgeschrieben');
  const lv1 = baueSpuren(1).find(x => x.reihe === 10).tempo;
  pruefe(spurInReihe(s, 10).tempo > lv1, 'Level 2 ist schneller');
}
{
  // Punkte-Farming: hin und her bringt nichts
  const s = neu();
  strasseFrei(s);
  eingabe(s, 'hoch'); bisGelandet(s);
  const p1 = s.punkte, f1 = s.felder;
  pruefe(p1 === K.PUNKTE_FELD && f1 === 1, 'erste neue Reihe zählt');
  for (let i = 0; i < 10; i++) {
    eingabe(s, 'runter'); bisGelandet(s);
    eingabe(s, 'hoch'); bisGelandet(s);
    eingabe(s, 'links'); bisGelandet(s);
    eingabe(s, 'rechts'); bisGelandet(s);
  }
  pruefe(s.punkte === p1 && s.felder === f1, `Hin- und Herspringen bringt nichts (Punkte ${s.punkte}, Felder ${s.felder})`);
  eingabe(s, 'hoch'); bisGelandet(s);
  pruefe(s.felder === 2 && s.punkte === 2 * K.PUNKTE_FELD, 'nächste neue Reihe zählt wieder');
}
{
  // Spiel vorbei nach drei Unfällen
  const s = neu();
  stoppeSpuren(s);
  for (let i = 0; i < 3; i++) {
    const sp = spurInReihe(s, 13);
    sp.objekte = [{ x0: 0, len: 1, typ: 'auto' }];
    setzeObjekt(s, 13, 0, 5);
    eingabe(s, 'hoch'); bisGelandet(s);
    laufe(s, 0.05);
    pruefe(s.zustand === ZUSTAND.UNFALL, `Unfall ${i + 1}`);
    laufe(s, K.UNFALL_DAUER + 0.05);
  }
  const e = ereignisse(s);
  pruefe(s.zustand === ZUSTAND.ENDE && s.leben === 0, 'Spiel vorbei nach drei Leben');
  pruefe(e.filter(x => x.typ === 'unfall').length === 3 && e.filter(x => x.typ === 'ende').length === 1, 'genau drei Unfälle und ein Ende');
}
{
  // Pause hält alles an, Eingaben werden ignoriert
  const s = neu();
  const vor = JSON.stringify(s.spuren.map(x => x.versatz));
  pausiere(s);
  laufe(s, 1);
  pruefe(eingabe(s, 'hoch') === false, 'in der Pause keine Sprünge');
  pruefe(JSON.stringify(s.spuren.map(x => x.versatz)) === vor, 'in der Pause bewegt sich nichts');
  setzeFort(s);
  pruefe(s.zustand === ZUSTAND.SPIELEN, 'weiter nach der Pause');
  // Pause während eines Unfalls kehrt in den Unfall zurück
  const u = neu();
  u.spuren.forEach(x => { x.tempo = 0; });
  spurInReihe(u, 13).objekte = [{ x0: 0, len: 1, typ: 'auto' }];
  setzeObjekt(u, 13, 0, 5);
  eingabe(u, 'hoch'); bisGelandet(u); laufe(u, 0.05);
  pausiere(u); laufe(u, 5); setzeFort(u);
  pruefe(u.zustand === ZUSTAND.UNFALL && u.leben === 2, 'Pause im Unfall: kein doppelter Abzug');
}
{
  // Kein Fahrzeug steht zum Levelstart vor dem Frosch
  for (let level = 1; level <= 12; level++) {
    const s = erstelleSpiel();
    s.level = level;
    neuStart(s);
    s.level = level;
    s.spuren = baueSpuren(level);
    s.spurNachReihe = {}; s.spuren.forEach(x => { s.spurNachReihe[x.reihe] = x; });
    pruefe(!fahrzeugTrifft(s, 13, 5.5), `Level ${level}: erste Fahrspur vor dem Start frei`);
  }
}

// ---------------------------------------------------------------
// Bot: spielt echte Level mit Vorausschau. Zeigt, dass die Muster schaffbar sind.
function klon(s) {
  const spuren = s.spuren.map(sp => ({ ...sp }));
  const nach = {};
  spuren.forEach(sp => { nach[sp.reihe] = sp; });
  const f = s.frosch;
  return { ...s, spuren, spurNachReihe: nach, ziele: s.ziele.slice(), frosch: { ...f, sprung: f.sprung ? { ...f.sprung } : null }, unfall: s.unfall ? { ...s.unfall } : null, ereignisse: [] };
}
const AKTIONEN = ['warten', 'hoch', 'links', 'rechts', 'runter'];
function fuehreAus(s, a) {
  if (a !== 'warten') {
    if (!eingabe(s, a)) return false;
    let n = 0;
    while (s.frosch.sprung && s.zustand === ZUSTAND.SPIELEN && n++ < 100) schritt(s, dt);
  } else {
    for (let i = 0; i < 12 && s.zustand === ZUSTAND.SPIELEN; i++) schritt(s, dt);
  }
  return s.zustand === ZUSTAND.SPIELEN || s.zustand === ZUSTAND.LEVELWECHSEL;
}
function bewertung(s, startZiele) {
  const neueZiele = s.ziele.filter(Boolean).length - startZiele;
  if (neueZiele > 0 || s.zustand === ZUSTAND.LEVELWECHSEL) return -1e6;
  const f = s.frosch;
  let wert = f.reihe * 100;
  if (f.reihe <= 3) {
    // Richtung nächstes freies Ziel
    let d = 99;
    K.ZIEL_SPALTEN.forEach((sp, i) => { if (!s.ziele[i]) d = Math.min(d, Math.abs(sp + 0.5 - f.x)); });
    wert += d * 30;
  }
  // Nicht zu nah am Rand stehen
  wert += Math.max(0, 1.5 - Math.min(f.x, K.SPALTEN - f.x)) * 60;
  return wert;
}
function planeZug(s) {
  const startZiele = s.ziele.filter(Boolean).length;
  let strahl = [{ s, erste: null, w: bewertung(s, startZiele) }];
  let bester = null;
  for (let tiefe = 0; tiefe < 26; tiefe++) {
    const kinder = [];
    for (const k of strahl) {
      for (const a of AKTIONEN) {
        const c = klon(k.s);
        if (!fuehreAus(c, a)) continue;
        const w = bewertung(c, startZiele);
        const kind = { s: c, erste: k.erste || a, w: w + tiefe * 0.5 };
        if (w === -1e6) return kind.erste;
        kinder.push(kind);
      }
    }
    if (!kinder.length) break;
    // Vielfalt: pro (Reihe, Viertelkachel) nur der beste
    const gesehen = new Map();
    for (const k of kinder) {
      const key = k.s.frosch.reihe + ':' + Math.round(k.s.frosch.x * 4);
      if (!gesehen.has(key) || gesehen.get(key).w > k.w) gesehen.set(key, k);
    }
    strahl = [...gesehen.values()].sort((a, b) => a.w - b.w).slice(0, 30);
    if (!bester || strahl[0].w < bester.w) bester = strahl[0];
  }
  return bester ? bester.erste : 'warten';
}

if (process.argv[2] !== 'schnell') {
  abschnitt('Bot spielt Level 1 bis 9 (Schaffbarkeit, inkl. Höchsttempo)');
  const s = erstelleSpiel();
  neuStart(s);
  let zeit = 0, unfaelle = 0;
  const zielLevel = 9;
  const t0 = Date.now();
  while (s.level < zielLevel + 1 && zeit < 1800 && s.zustand !== ZUSTAND.ENDE) {
    if (s.zustand === ZUSTAND.SPIELEN && !s.frosch.sprung) {
      const a = planeZug(s);
      if (a !== 'warten') eingabe(s, a);
    }
    const vor = s.leben;
    schritt(s, dt); zeit += dt;
    if (s.leben < vor) { unfaelle++; s.leben = 3; }   // Bot-Unfälle zählen wir nur
    for (const e of ereignisse(s)) if (e.typ === 'levelstart') console.log(`    Level ${e.level - 1} geschafft nach ${zeit.toFixed(0)} s Spielzeit`);
  }
  console.log(`    Bot: Level ${s.level}, Unfälle ${unfaelle}, Punkte ${s.punkte}, Felder ${s.felder}, Rechenzeit ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  pruefe(s.level >= zielLevel + 1, `Bot schafft Level 1–${zielLevel}`);
  pruefe(unfaelle <= 3, `Bot hatte ${unfaelle} Unfälle (Planer mit Vorausschau sollte kaum verunglücken)`);
}

console.log(`\n${ok} Prüfungen bestanden, ${fehler} fehlgeschlagen`);
process.exit(fehler ? 1 : 0);
