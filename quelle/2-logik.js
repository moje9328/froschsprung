// ===================================================================
// 2 · SPIELLOGIK
// Reine Regeln ohne Bildschirm, Ton oder Browser. Alles steckt im Zustandsobjekt s.
// Ereignisse (Sprung, Ziel, Unfall …) landen in s.ereignisse; Grafik und Ton holen sie dort ab.
// ===================================================================

const ZUSTAND = {
  START: 'start',
  SPIELEN: 'spielen',
  PAUSE: 'pause',
  UNFALL: 'unfall',
  LEVELWECHSEL: 'levelwechsel',
  ENDE: 'ende',
};

const RICHTUNGEN = {
  hoch: [0, -1],
  runter: [0, 1],
  links: [-1, 0],
  rechts: [1, 0],
};

const STRASSE = new Set(K.STRASSEN_REIHEN);
const FLUSS = new Set(K.FLUSS_REIHEN);
const istStrasse = reihe => STRASSE.has(reihe);
const istFluss = reihe => FLUSS.has(reihe);
const istSicher = reihe => !STRASSE.has(reihe) && !FLUSS.has(reihe);

function modulo(a, m) {
  return ((a % m) + m) % m;
}

// ---------- Spuren ----------

function spurInReihe(s, reihe) {
  return s.spurNachReihe[reihe] || null;
}

function spurTempo(spur) {
  return spur.richtung * spur.tempo;
}

// Linke Kante eines Objekts im sichtbaren Bereich. Die Rundstrecke reicht von -(L-11) bis 11,
// der Umlaufpunkt liegt also immer ganz außerhalb des Bildes.
function objektX(spur, o) {
  return modulo(o.x0 + spur.versatz, spur.L) - (spur.L - K.SPALTEN);
}

function objekteInSpur(spur) {
  return spur.objekte.map(o => ({ x: objektX(spur, o), len: o.len, typ: o.typ }));
}

function bewegeSpuren(s, dt) {
  for (const spur of s.spuren) spur.versatz += spurTempo(spur) * dt;
}

function fahrzeugTrifft(s, reihe, x) {
  const spur = spurInReihe(s, reihe);
  if (!spur || spur.art !== 'strasse') return null;
  const links = x - K.FROSCH_HALBBREITE;
  const rechts = x + K.FROSCH_HALBBREITE;
  for (const o of spur.objekte) {
    const ox = objektX(spur, o);
    if (rechts > ox + K.FAHRZEUG_RAND && links < ox + o.len - K.FAHRZEUG_RAND) return o;
  }
  return null;
}

function plattformUnter(s, reihe, x) {
  const spur = spurInReihe(s, reihe);
  if (!spur || spur.art !== 'fluss') return null;
  for (const o of spur.objekte) {
    const ox = objektX(spur, o);
    if (x >= ox - K.TRAG_TOLERANZ && x <= ox + o.len + K.TRAG_TOLERANZ) return o;
  }
  return null;
}

const ausserhalb = x => x < 0 || x > K.SPALTEN;

// ---------- Spielablauf ----------

function erstelleSpiel() {
  const s = {
    zustand: ZUSTAND.START,
    vorPause: null,
    level: 1,
    punkte: 0,
    leben: K.START_LEBEN,
    felder: 0,
    ziele: K.ZIEL_SPALTEN.map(() => false),
    spuren: [],
    spurNachReihe: {},
    frosch: null,
    puffer: null,
    rundeBeste: K.START_REIHE,
    timer: 0,
    unfall: null,
    zeit: 0,
    ereignisse: [],
  };
  baueLevel(s);
  setzeFrosch(s);
  return s;
}

function baueLevel(s) {
  s.spuren = baueSpuren(s.level);
  s.spurNachReihe = {};
  for (const spur of s.spuren) s.spurNachReihe[spur.reihe] = spur;
}

function setzeFrosch(s) {
  s.frosch = {
    x: K.START_SPALTE + 0.5,
    reihe: K.START_REIHE,
    blick: 'hoch',
    sprung: null,
    erscheinen: K.ERSCHEINEN_DAUER,
  };
  s.puffer = null;
  s.rundeBeste = K.START_REIHE;   // neuer Versuch: jede Reihe zählt wieder einmal
}

// Startet ein neues Spiel im selben Zustandsobjekt (keine zweite Schleife, keine neuen Listener)
function neuStart(s) {
  s.level = 1;
  s.punkte = 0;
  s.leben = K.START_LEBEN;
  s.felder = 0;
  s.ziele = K.ZIEL_SPALTEN.map(() => false);
  s.unfall = null;
  s.vorPause = null;
  s.timer = 0;
  s.ereignisse.length = 0;
  baueLevel(s);
  setzeFrosch(s);
  s.zustand = ZUSTAND.SPIELEN;
}

function pausiere(s) {
  if (s.zustand !== ZUSTAND.SPIELEN && s.zustand !== ZUSTAND.UNFALL && s.zustand !== ZUSTAND.LEVELWECHSEL) return false;
  s.vorPause = s.zustand;
  s.zustand = ZUSTAND.PAUSE;
  s.puffer = null;
  return true;
}

function setzeFort(s) {
  if (s.zustand !== ZUSTAND.PAUSE) return false;
  s.zustand = s.vorPause || ZUSTAND.SPIELEN;
  s.vorPause = null;
  return true;
}

// Eine Richtungseingabe. Während eines Hüpfers wird höchstens eine weitere gemerkt.
function eingabe(s, richtung) {
  if (s.zustand !== ZUSTAND.SPIELEN || !RICHTUNGEN[richtung]) return false;
  if (s.frosch.sprung) {
    if (s.puffer === null) s.puffer = richtung;
    return true;
  }
  return starteSprung(s, richtung);
}

function zielIndex(spalte) {
  return K.ZIEL_SPALTEN.indexOf(spalte);
}

function starteSprung(s, richtung) {
  const f = s.frosch;
  const [dx, dy] = RICHTUNGEN[richtung];
  f.blick = richtung;
  const von = f.reihe;
  const nach = von + dy;
  let nachX;

  if (nach > K.START_REIHE || nach < K.ZIEL_REIHE) {
    s.ereignisse.push({ typ: 'blockiert' });
    return false;
  }
  if (nach === K.ZIEL_REIHE) {
    const spalte = Math.min(K.SPALTEN - 1, Math.max(0, Math.floor(f.x)));
    const i = zielIndex(spalte);
    if (i < 0 || s.ziele[i]) {   // Hecke oder schon besetzt: kein Sprung, kein Leben weg
      s.ereignisse.push({ typ: 'blockiert', spalte, besetzt: i >= 0 });
      return false;
    }
    nachX = spalte + 0.5;
  } else {
    nachX = f.x + dx;
    if (dx !== 0 && (nachX < K.SEITEN_GRENZE || nachX > K.SPALTEN - K.SEITEN_GRENZE)) {
      s.ereignisse.push({ typ: 'blockiert' });
      return false;
    }
    // Auf festem Boden sitzt der Frosch immer mittig in einer Kachel
    if (istSicher(nach) || istStrasse(nach)) {
      nachX = Math.min(K.SPALTEN - 1, Math.max(0, Math.floor(nachX))) + 0.5;
    }
  }

  // Springt er von einer Plattform aufs Wasser, nimmt er deren Schwung mit
  let driftV = 0;
  if (istFluss(von) && istFluss(nach)) {
    const spur = spurInReihe(s, von);
    if (plattformUnter(s, von, f.x)) driftV = spurTempo(spur);
  }

  f.sprung = { vonX: f.x, vonReihe: von, nachX, nachReihe: nach, t: 0, drift: 0, driftV };
  s.ereignisse.push({ typ: 'sprung', richtung });
  return true;
}

function unfall(s, art) {
  if (s.zustand !== ZUSTAND.SPIELEN) return;   // pro Unfall genau ein Leben
  const f = s.frosch;
  s.zustand = ZUSTAND.UNFALL;
  s.leben = Math.max(0, s.leben - 1);
  s.timer = K.UNFALL_DAUER;
  s.unfall = { art, x: f.x, reihe: f.reihe, zeit: 0 };
  f.sprung = null;
  s.puffer = null;
  s.ereignisse.push({ typ: 'unfall', art, x: f.x, reihe: f.reihe });
}

function neueReiheErreicht(s, reihe) {
  if (reihe >= s.rundeBeste) return;
  s.felder += s.rundeBeste - reihe;
  s.punkte += K.PUNKTE_FELD * (s.rundeBeste - reihe);
  s.rundeBeste = reihe;
  s.ereignisse.push({ typ: 'feld', reihe });
}

function lande(s) {
  const f = s.frosch;
  const sp = f.sprung;
  f.sprung = null;
  f.reihe = sp.nachReihe;

  if (f.reihe === K.ZIEL_REIHE) {
    zielErreicht(s);
    return;
  }
  if (istFluss(f.reihe) && !plattformUnter(s, f.reihe, f.x)) {
    unfall(s, 'wasser');
    return;
  }
  if (istStrasse(f.reihe) && fahrzeugTrifft(s, f.reihe, f.x)) {
    unfall(s, 'auto');
    return;
  }
  neueReiheErreicht(s, f.reihe);
  s.ereignisse.push({ typ: 'landung', reihe: f.reihe });
  if (s.puffer) {
    const r = s.puffer;
    s.puffer = null;
    starteSprung(s, r);
  }
}

function zielErreicht(s) {
  const f = s.frosch;
  const spalte = Math.floor(f.x);
  const i = zielIndex(spalte);
  neueReiheErreicht(s, K.ZIEL_REIHE);
  s.ziele[i] = true;
  s.punkte += K.PUNKTE_ZIEL;
  s.ereignisse.push({ typ: 'ziel', spalte, index: i });
  if (s.ziele.every(Boolean)) {
    s.punkte += K.PUNKTE_LEVEL;
    s.zustand = ZUSTAND.LEVELWECHSEL;
    s.timer = K.LEVELWECHSEL_DAUER;
    s.puffer = null;
    f.reihe = K.ZIEL_REIHE;
    f.versteckt = true;
    s.ereignisse.push({ typ: 'levelgeschafft', level: s.level });
  } else {
    setzeFrosch(s);
  }
}

function froschSchritt(s, dt) {
  const f = s.frosch;
  if (f.erscheinen > 0) f.erscheinen = Math.max(0, f.erscheinen - dt);

  if (f.sprung) {
    const sp = f.sprung;
    sp.t += dt;
    const p = Math.min(1, sp.t / K.SPRUNG_DAUER);
    sp.drift += sp.driftV * dt;
    f.x = sp.vonX + (sp.nachX - sp.vonX) * p + sp.drift;
    // Für Zusammenstöße zählt in der ersten Sprunghälfte die alte, danach die neue Reihe
    const reihe = p < 0.5 ? sp.vonReihe : sp.nachReihe;
    if (ausserhalb(f.x)) { f.reihe = reihe; unfall(s, 'abgetrieben'); return; }
    if (istStrasse(reihe) && fahrzeugTrifft(s, reihe, f.x)) { f.reihe = reihe; unfall(s, 'auto'); return; }
    if (p >= 1) {
      f.x = sp.nachX + sp.drift;
      lande(s);
    }
    return;
  }

  const r = f.reihe;
  if (istFluss(r)) {
    const spur = spurInReihe(s, r);
    const neuX = f.x + spurTempo(spur) * dt;   // mitfahren, wie die Spur sich wirklich bewegt
    if (!plattformUnter(s, r, neuX)) { unfall(s, 'wasser'); return; }
    f.x = neuX;
    if (ausserhalb(f.x)) { unfall(s, 'abgetrieben'); return; }
  } else if (istStrasse(r) && fahrzeugTrifft(s, r, f.x)) {
    unfall(s, 'auto');
    return;
  }
  if (s.puffer) {
    const richtung = s.puffer;
    s.puffer = null;
    starteSprung(s, richtung);
  }
}

// Ein fester Simulationsschritt
function schritt(s, dt) {
  if (s.zustand === ZUSTAND.PAUSE) return;
  s.zeit += dt;
  bewegeSpuren(s, dt);

  if (s.zustand === ZUSTAND.SPIELEN) {
    froschSchritt(s, dt);
  } else if (s.zustand === ZUSTAND.UNFALL) {
    s.unfall.zeit += dt;
    s.timer -= dt;
    if (s.timer <= 0) {
      if (s.leben <= 0) {
        s.zustand = ZUSTAND.ENDE;
        s.ereignisse.push({ typ: 'ende', punkte: s.punkte });
      } else {
        s.unfall = null;
        setzeFrosch(s);
        s.zustand = ZUSTAND.SPIELEN;
        s.ereignisse.push({ typ: 'neuerFrosch' });
      }
    }
  } else if (s.zustand === ZUSTAND.LEVELWECHSEL) {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.level += 1;
      s.ziele = K.ZIEL_SPALTEN.map(() => false);
      baueLevel(s);
      setzeFrosch(s);
      s.zustand = ZUSTAND.SPIELEN;
      s.ereignisse.push({ typ: 'levelstart', level: s.level });
    }
  }
}

// Die Reihe, in der der Frosch gerade zu sehen ist (mit Sprung als Zwischenwert)
function froschAnsicht(s) {
  const f = s.frosch;
  if (!f.sprung) return { x: f.x, y: f.reihe, p: 1 };
  const p = Math.min(1, f.sprung.t / K.SPRUNG_DAUER);
  return { x: f.x, y: f.sprung.vonReihe + (f.sprung.nachReihe - f.sprung.vonReihe) * p, p };
}
