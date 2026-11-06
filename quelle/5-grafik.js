// ===================================================================
// 5 · GRAFIK
// Eigene Pixelgrafik: Jede Kachel hat 16 × 16 Bildpunkte. Gezeichnet wird in der echten
// Bildschirmauflösung (devicePixelRatio) ohne Weichzeichnen, damit alles knackig scharf bleibt.
// ===================================================================

const Grafik = (() => {
  const P = K.KACHEL_PIXEL;
  const BREITE = K.SPALTEN * P;
  const HOEHE = K.REIHEN * P;

  let canvas = null;
  let ctx = null;
  let skala = 1;               // Bildschirmpunkte pro Grafikpunkt
  let reduziert = false;       // prefers-reduced-motion
  let hintergrund = null;
  const bilder = {};
  const partikel = [];
  const spritzer = [];

  // ---------- Werkzeuge für Pixelbilder ----------

  function leinwand(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Malt mit Rechtecken in einem kleinen Bild und zieht danach eine dunkle Umrandung
  function pixelBild(w, h, malen, umriss) {
    const c = leinwand(w, h);
    const g = c.getContext('2d');
    const r = (x, y, bw, bh, farbe) => { g.fillStyle = farbe; g.fillRect(x, y, bw, bh); };
    malen(r, g);
    if (umriss) umrande(c, umriss);
    return c;
  }

  // Aus Textzeilen ein Bild machen: jedes Zeichen ist ein Bildpunkt
  function ausKarte(zeilen, farben, umriss) {
    const h = zeilen.length;
    const w = zeilen[0].length;
    return pixelBild(w, h, r => {
      zeilen.forEach((zeile, y) => {
        for (let x = 0; x < w; x++) {
          const f = farben[zeile[x]];
          if (f) r(x, y, 1, 1, f);
        }
      });
    }, umriss);
  }

  function umrande(c, farbe) {
    const g = c.getContext('2d');
    const { width: w, height: h } = c;
    const d = g.getImageData(0, 0, w, h);
    const voll = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d.data[(y * w + x) * 4 + 3] > 0;
    const rand = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!voll(x, y) && (voll(x - 1, y) || voll(x + 1, y) || voll(x, y - 1) || voll(x, y + 1))) rand.push([x, y]);
      }
    }
    g.fillStyle = farbe;
    for (const [x, y] of rand) g.fillRect(x, y, 1, 1);
  }

  function gespiegelt(bild) {
    const c = leinwand(bild.width, bild.height);
    const g = c.getContext('2d');
    g.translate(bild.width, 0);
    g.scale(-1, 1);
    g.drawImage(bild, 0, 0);
    return c;
  }

  function gedreht(bild, viertel) {
    const c = leinwand(bild.width, bild.height);
    const g = c.getContext('2d');
    g.translate(bild.width / 2, bild.height / 2);
    g.rotate((viertel * Math.PI) / 2);
    g.drawImage(bild, -bild.width / 2, -bild.height / 2);
    return c;
  }

  // Kleiner, fester Zufall, damit der Hintergrund immer gleich aussieht
  function zufall(saat) {
    let a = saat >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Figuren ----------

  const FROSCH_FARBEN = { g: '#6be04f', l: '#b8f78e', d: '#2f9e34', w: '#ffffff', k: '#10131c' };
  const FROSCH_UMRISS = '#0b2a14';

  const FROSCH_SITZT = [
    '................',
    '................',
    '....www..www....',
    '..g.wkwggwkw.g..',
    '.gg.gwwggwwg.gg.',
    '.gggggggggggggg.',
    '..gggllllllggg..',
    '...ggdlllldgg...',
    '...gggddddggg...',
    '....gggggggg....',
    '.gg.gggggggg.gg.',
    'gggg.gggggg.gggg',
    'gg.g..gggg..g.gg',
    'g..gg......gg..g',
    '................',
    '................',
  ];
  const FROSCH_SPRINGT = [
    '.g............g.',
    '.gg.www..www.gg.',
    '..g.wkwggwkw.g..',
    '..ggwwggggwwgg..',
    '...gggggggggg...',
    '...ggllllllgg...',
    '...ggdlllldgg...',
    '...gggddddggg...',
    '....gggggggg....',
    '.....gggggg.....',
    '....gg....gg....',
    '...gg......gg...',
    '...g........g...',
    '..gg........gg..',
    '..g..........g..',
    '................',
  ];

  function baueFrosch() {
    const sitzt = ausKarte(FROSCH_SITZT, FROSCH_FARBEN, FROSCH_UMRISS);
    const springt = ausKarte(FROSCH_SPRINGT, FROSCH_FARBEN, FROSCH_UMRISS);
    const viertel = { hoch: 0, rechts: 1, runter: 2, links: 3 };
    bilder.frosch = {};
    for (const [r, v] of Object.entries(viertel)) {
      bilder.frosch[r] = { sitzt: gedreht(sitzt, v), springt: gedreht(springt, v) };
    }
    // Plattgefahren: der sitzende Frosch, flach gedrückt, in Grautönen mit Sternchen
    bilder.platt = pixelBild(16, 16, (r, g) => {
      g.drawImage(sitzt, 0, 4, 16, 8);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(40, 90, 40, 0.35)';
      g.fillRect(0, 0, 16, 16);
    });
  }

  const DUNKEL = '#0b0f1c';
  const REIFEN = '#15161d';
  const GLAS = '#9fe3ff';
  const LICHT = '#fff4a8';
  const RUECK = '#ff3b3b';

  function baueFahrzeuge() {
    const fahrzeug = {
      auto: pixelBild(16, 16, r => {
        r(2, 2, 3, 2, REIFEN); r(11, 2, 3, 2, REIFEN); r(2, 12, 3, 2, REIFEN); r(11, 12, 3, 2, REIFEN);
        r(2, 3, 12, 10, '#ff4b3e'); r(1, 4, 14, 8, '#ff4b3e');
        r(5, 4, 5, 8, '#c92d24');
        r(10, 4, 2, 8, GLAS); r(4, 5, 1, 6, GLAS);
        r(14, 5, 1, 2, LICHT); r(14, 9, 1, 2, LICHT);
        r(1, 5, 1, 1, RUECK); r(1, 10, 1, 1, RUECK);
        r(6, 5, 3, 1, '#ff8a80');
      }, DUNKEL),
      kaefer: pixelBild(16, 16, r => {
        r(3, 2, 3, 2, REIFEN); r(10, 2, 3, 2, REIFEN); r(3, 12, 3, 2, REIFEN); r(10, 12, 3, 2, REIFEN);
        r(3, 3, 10, 10, '#ff5fb3'); r(2, 4, 12, 8, '#ff5fb3'); r(1, 6, 14, 4, '#ff5fb3');
        r(5, 5, 5, 6, '#ffd1ea');
        r(10, 5, 2, 6, GLAS); r(4, 6, 1, 4, GLAS);
        r(14, 6, 1, 1, LICHT); r(14, 9, 1, 1, LICHT);
      }, DUNKEL),
      flitzer: pixelBild(16, 16, r => {
        r(2, 1, 4, 3, REIFEN); r(11, 2, 3, 2, REIFEN); r(2, 12, 4, 3, REIFEN); r(11, 12, 3, 2, REIFEN);
        r(0, 3, 2, 10, '#262833');
        r(2, 5, 13, 6, '#ffd23f'); r(4, 4, 8, 8, '#ffd23f');
        r(2, 7, 14, 2, '#1a1c26');
        r(7, 5, 3, 6, '#2b2f45'); r(8, 6, 1, 4, GLAS);
        r(15, 6, 1, 1, LICHT); r(15, 9, 1, 1, LICHT);
      }, DUNKEL),
      traktor: pixelBild(16, 16, r => {
        r(1, 0, 6, 4, REIFEN); r(1, 12, 6, 4, REIFEN);
        r(11, 3, 3, 2, REIFEN); r(11, 11, 3, 2, REIFEN);
        r(2, 1, 1, 2, '#3a3d4d'); r(4, 1, 1, 2, '#3a3d4d'); r(2, 13, 1, 2, '#3a3d4d'); r(4, 13, 1, 2, '#3a3d4d');
        r(3, 4, 12, 8, '#ff8a3d');
        r(3, 4, 6, 8, '#c95f1c');
        r(4, 5, 4, 6, '#ffc08f');
        r(11, 5, 1, 1, '#9aa3b8');
        r(14, 6, 1, 4, LICHT);
      }, DUNKEL),
      lieferwagen: pixelBild(32, 16, r => {
        r(4, 2, 4, 2, REIFEN); r(22, 2, 4, 2, REIFEN); r(4, 12, 4, 2, REIFEN); r(22, 12, 4, 2, REIFEN);
        r(1, 3, 23, 10, '#e9eef7');
        r(2, 7, 21, 2, '#2fd0c8');
        r(2, 4, 21, 1, '#ffffff');
        r(24, 4, 6, 8, '#d3dbea'); r(25, 3, 4, 10, '#d3dbea');
        r(27, 4, 2, 8, GLAS);
        r(30, 5, 1, 2, LICHT); r(30, 9, 1, 2, LICHT);
        r(1, 4, 1, 1, RUECK); r(1, 11, 1, 1, RUECK);
      }, DUNKEL),
      laster: pixelBild(48, 16, r => {
        r(4, 1, 4, 2, REIFEN); r(10, 1, 4, 2, REIFEN); r(28, 1, 4, 2, REIFEN); r(40, 2, 4, 2, REIFEN);
        r(4, 13, 4, 2, REIFEN); r(10, 13, 4, 2, REIFEN); r(28, 13, 4, 2, REIFEN); r(40, 12, 4, 2, REIFEN);
        r(1, 2, 33, 12, '#ff6a3d');
        for (let x = 3; x < 33; x += 4) r(x, 2, 1, 12, '#d24a22');
        r(1, 3, 33, 1, '#ff9a70');
        r(34, 6, 3, 4, '#3a3d4d');
        r(37, 3, 10, 10, '#3a7bff'); r(38, 2, 8, 12, '#3a7bff');
        r(38, 4, 4, 8, '#2556c8');
        r(44, 4, 2, 8, GLAS);
        r(46, 4, 1, 2, LICHT); r(46, 10, 1, 2, LICHT);
      }, DUNKEL),
    };
    bilder.fahrzeug = {};
    for (const [name, bild] of Object.entries(fahrzeug)) {
      bilder.fahrzeug[name] = { 1: bild, '-1': gespiegelt(bild) };
    }
  }

  function baueStamm(len) {
    const w = len * P;
    const zz = zufall(len * 977);
    return pixelBild(w, 16, r => {
      r(2, 3, w - 4, 10, '#8a5a2b');
      r(2, 4, w - 4, 2, '#b07a3c');
      r(2, 11, w - 4, 1, '#6a4220');
      for (let i = 0; i < len * 3; i++) {
        const x = 5 + Math.floor(zz() * (w - 12));
        const y = 6 + Math.floor(zz() * 5);
        r(x, y, 2 + Math.floor(zz() * 4), 1, '#5e3a1a');
      }
      // Schnittflächen mit Jahresringen
      r(0, 4, 3, 8, '#d9a066'); r(1, 3, 2, 10, '#d9a066');
      r(1, 6, 1, 4, '#a8743e');
      r(w - 3, 4, 3, 8, '#d9a066'); r(w - 3, 3, 2, 10, '#d9a066');
      r(w - 2, 6, 1, 4, '#a8743e');
      // ein kleiner Ast
      if (len >= 4) { r(Math.floor(w * 0.6), 1, 2, 3, '#8a5a2b'); r(Math.floor(w * 0.6) + 1, 0, 2, 2, '#4fb556'); }
    }, '#3a2310');
  }

  function baueSeerosen() {
    bilder.seerose = [0, 1, 2].map(v => pixelBild(16, 16, (r, g) => {
      // runde Blattform
      const mitte = 7.5;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const d = Math.hypot(x - mitte, y - mitte);
          if (d <= 6.6) r(x, y, 1, 1, d > 5.4 ? '#2a8f45' : '#45c25c');
        }
      }
      // Kerbe, je Variante in eine andere Richtung
      const kerbe = [[8, 2], [13, 8], [3, 12]][v];
      g.clearRect(kerbe[0] - 1, kerbe[1] - 1, 3, 3);
      g.clearRect(Math.round((kerbe[0] + 7.5) / 2), Math.round((kerbe[1] + 7.5) / 2), 1, 1);
      r(7, 7, 2, 2, '#2a8f45');
      r(5, 9, 2, 1, '#6fd97f'); r(9, 5, 2, 1, '#6fd97f');
      if (v === 1) { // Blüte
        r(4, 3, 3, 3, '#ff8fc8'); r(5, 2, 1, 5, '#ff8fc8'); r(3, 4, 5, 1, '#ff8fc8'); r(5, 4, 1, 1, '#ffe36b');
      }
    }, '#0f4f3a'));
  }

  // ---------- Hintergrund (einmal gemalt) ----------

  function baueHintergrund() {
    const zz = zufall(4242);
    hintergrund = pixelBild(BREITE, HOEHE, r => {
      const reiheY = n => n * P;
      // Gras: Ufer und Start
      const gras = (reihe, blumen) => {
        const y0 = reiheY(reihe);
        r(0, y0, BREITE, P, '#3c9b45');
        for (let i = 0; i < 40; i++) r(Math.floor(zz() * BREITE), y0 + 1 + Math.floor(zz() * 13), 1, 2, '#52b85a');
        for (let i = 0; i < 18; i++) r(Math.floor(zz() * BREITE), y0 + 1 + Math.floor(zz() * 14), 2, 1, '#2f8139');
        for (let i = 0; i < blumen; i++) {
          const x = 2 + Math.floor(zz() * (BREITE - 4));
          const y = y0 + 3 + Math.floor(zz() * 10);
          const f = ['#ffe36b', '#ffffff', '#ff8fc8'][i % 3];
          r(x, y, 1, 1, f); r(x - 1, y, 1, 1, f); r(x + 1, y, 1, 1, f); r(x, y - 1, 1, 1, f); r(x, y + 1, 1, 1, f);
          r(x, y, 1, 1, '#f2b84b');
        }
      };
      gras(K.UFER_REIHE, 6);
      gras(K.START_REIHE, 7);

      // Zielreihe: dichte Hecke mit fünf Buchten
      const y0 = reiheY(K.ZIEL_REIHE);
      r(0, y0, BREITE, P, '#1f6b3a');
      for (let i = 0; i < 120; i++) r(Math.floor(zz() * BREITE), y0 + Math.floor(zz() * 15), 2, 1, i % 2 ? '#2a8a4a' : '#165230');
      for (let i = 0; i < 30; i++) r(Math.floor(zz() * BREITE), y0 + Math.floor(zz() * 15), 1, 1, '#3fb35f');
      for (const sp of K.ZIEL_SPALTEN) {
        const x = sp * P;
        r(x + 1, y0 + 2, 14, 14, '#127f86');
        r(x + 2, y0 + 1, 12, 1, '#127f86');
        r(x + 2, y0 + 3, 4, 1, '#3ac9c9'); r(x + 9, y0 + 9, 3, 1, '#3ac9c9');
      }
      r(0, y0 + 15, BREITE, 1, '#14502a');

      // Fluss
      for (const reihe of K.FLUSS_REIHEN) {
        const y = reiheY(reihe);
        r(0, y, BREITE, P, '#1aa7a8');
        for (let i = 0; i < 26; i++) r(Math.floor(zz() * BREITE), y + 2 + Math.floor(zz() * 12), 3 + Math.floor(zz() * 4), 1, '#1590a0');
        for (let i = 0; i < 8; i++) r(Math.floor(zz() * BREITE), y + 2 + Math.floor(zz() * 12), 2, 1, '#46c9c6');
      }
      // Uferkanten
      r(0, reiheY(2), BREITE, 1, '#0f7480');
      r(0, reiheY(7) - 1, BREITE, 1, '#0f7480');

      // Mittelstreifen: warmer Pflasterweg
      for (const reihe of K.MITTEL_REIHEN) {
        const y = reiheY(reihe);
        r(0, y, BREITE, P, '#c79a5b');
        for (let sy = 0; sy < P; sy += 4) {
          const versatz = (sy / 4) % 2 ? 3 : 0;
          r(0, y + sy, BREITE, 1, '#a87b40');
          for (let sx = versatz; sx < BREITE; sx += 6) r(sx, y + sy, 1, 4, '#a87b40');
          for (let sx = versatz + 2; sx < BREITE; sx += 6) r(sx, y + sy + 1, 2, 1, '#dcb478');
        }
      }
      // Poller auf dem oberen Mittelstreifen (reine Deko am Rand)
      r(0, reiheY(7), BREITE, 1, '#8c6a3a');

      // Straße
      for (const reihe of K.STRASSEN_REIHEN) {
        const y = reiheY(reihe);
        r(0, y, BREITE, P, '#2b2f45');
        for (let i = 0; i < 60; i++) r(Math.floor(zz() * BREITE), y + Math.floor(zz() * P), 1, 1, i % 3 ? '#33384f' : '#23263a');
      }
      // Fahrbahnmarkierung zwischen den Spuren
      for (let reihe = K.STRASSEN_REIHEN[0] + 1; reihe <= K.STRASSEN_REIHEN[K.STRASSEN_REIHEN.length - 1]; reihe++) {
        for (let x = 2; x < BREITE; x += 10) r(x, reiheY(reihe), 6, 1, '#d8d3b8');
      }
      // Bordsteine
      r(0, reiheY(9) - 2, BREITE, 2, '#9aa3b8'); r(0, reiheY(9) - 1, BREITE, 1, '#6c748a');
      r(0, reiheY(14), BREITE, 2, '#9aa3b8'); r(0, reiheY(14) + 2, BREITE, 1, '#6c748a');
    });
  }

  // ---------- Einrichten und Größe ----------

  function init(c) {
    canvas = c;
    ctx = canvas.getContext('2d', { alpha: false });
    baueFrosch();
    baueFahrzeuge();
    bilder.stamm = {};
    for (let n = 2; n <= 7; n++) bilder.stamm[n] = baueStamm(n);
    baueSeerosen();
    baueHintergrund();
  }

  function setzeReduziert(wert) { reduziert = wert; }

  // Passt das Spielfeld in den freien Platz: gleiches Seitenverhältnis, keine Verzerrung.
  // Wenn möglich, wird ein ganzzahliger Maßstab gewählt, dann ist jeder Pixel gleich groß.
  function groesse(platzW, platzH, dpr) {
    const cssW = Math.max(110, Math.min(platzW, (platzH * BREITE) / HOEHE));
    let s = (cssW * dpr) / BREITE;
    const ganz = Math.floor(s);
    if (ganz >= 2 && ganz / s >= 0.86) s = ganz;
    const w = Math.round(BREITE * s);
    const h = Math.round(HOEHE * s);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    skala = w / BREITE;
    return { cssW: w / dpr, cssH: h / dpr };
  }

  // Auf ganze Bildschirmpunkte runden, damit Kanten scharf bleiben
  const rund = v => Math.round(v * skala) / skala;

  function bild(b, x, y, w = b.width, h = b.height) {
    ctx.drawImage(b, rund(x), rund(y), rund(x + w) - rund(x), rund(y + h) - rund(y));
  }

  // ---------- Effekte ----------

  function zielEffekt(spalte) {
    const cx = (spalte + 0.5) * P;
    const cy = 0.5 * P;
    const n = reduziert ? 8 : 26;
    const farben = ['#f2b84b', '#ffe36b', '#6be04f', '#ffffff', '#2fd0c8'];
    for (let i = 0; i < n; i++) {
      const w = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const v = (reduziert ? 12 : 30) + Math.random() * 40;
      partikel.push({ x: cx, y: cy, vx: Math.cos(w) * v, vy: Math.sin(w) * v + 18, leben: 0.7 + Math.random() * 0.3, farbe: farben[i % farben.length] });
    }
  }

  function unfallEffekt(art, x, reihe) {
    if (art === 'auto') return;
    spritzer.push({ x: x * P, y: (reihe + 0.5) * P, t: 0 });
    if (reduziert) return;
    for (let i = 0; i < 12; i++) {
      const w = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 25 + Math.random() * 35;
      partikel.push({ x: x * P, y: (reihe + 0.5) * P, vx: Math.cos(w) * v, vy: Math.sin(w) * v, leben: 0.5 + Math.random() * 0.3, farbe: i % 2 ? '#ffffff' : '#7fe6e0', schwer: true });
    }
  }

  function effekteSchritt(dt) {
    for (let i = partikel.length - 1; i >= 0; i--) {
      const p = partikel[i];
      p.leben -= dt;
      if (p.leben <= 0) { partikel.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.schwer ? 160 : 60) * dt;
    }
    for (let i = spritzer.length - 1; i >= 0; i--) {
      spritzer[i].t += dt;
      if (spritzer[i].t > 0.9) spritzer.splice(i, 1);
    }
  }

  function effekteLeeren() {
    partikel.length = 0;
    spritzer.length = 0;
  }

  // ---------- Zeichnen ----------

  function zeichneWasser(s) {
    if (reduziert) return;
    ctx.fillStyle = '#7fe6e0';
    for (const reihe of K.FLUSS_REIHEN) {
      const spur = s.spurNachReihe[reihe];
      const y = reihe * P;
      // Wellen treiben langsam in Fließrichtung
      const verschiebung = spur ? spur.versatz * 3 : 0;
      for (let i = 0; i < 7; i++) {
        const basis = (i * 53 + reihe * 31) % (BREITE + 20);
        const x = ((basis + verschiebung) % (BREITE + 20) + BREITE + 20) % (BREITE + 20) - 10;
        const yy = y + 3 + ((i * 5 + reihe * 3) % 10);
        const phase = Math.sin(s.zeit * 2 + i + reihe) > 0 ? 3 : 2;
        ctx.fillRect(rund(x), rund(yy), rund(phase), rund(1));
      }
    }
  }

  function zeichneSpuren(s) {
    for (const spur of s.spuren) {
      const y = spur.reihe * P;
      spur.objekte.forEach((o, i) => {
        const x = objektX(spur, o) * P;
        if (x > BREITE || x + o.len * P < 0) return;
        if (o.typ === 'stamm') {
          bild(bilder.stamm[o.len] || bilder.stamm[3], x, y);
        } else if (o.typ === 'seerosen') {
          for (let n = 0; n < o.len; n++) {
            // sanftes Schaukeln (aus bei weniger Bewegung)
            const wipp = reduziert ? 0 : Math.round(Math.sin(s.zeit * 3 + n + i) * 0.6);
            bild(bilder.seerose[(n + i) % 3], x + n * P, y + wipp);
          }
        } else {
          const b = bilder.fahrzeug[o.typ];
          if (b) bild(b[spur.richtung], x, y);
        }
      });
    }
  }

  function zeichneZiele(s) {
    s.ziele.forEach((besetzt, i) => {
      const x = K.ZIEL_SPALTEN[i] * P;
      if (besetzt) {
        const hops = s.zustand === ZUSTAND.LEVELWECHSEL && !reduziert ? Math.round(Math.abs(Math.sin(s.zeit * 8 + i)) * 3) : 0;
        bild(bilder.frosch.runter.sitzt, x, -hops + 1);
        // goldene Markierung: besetzt
        ctx.fillStyle = '#f2b84b';
        ctx.fillRect(rund(x + 1), rund(14), rund(14), rund(1));
      } else {
        bild(bilder.seerose[i % 3], x, 1);
        // blinkende Ecken: hier ist noch frei
        const an = reduziert || Math.sin(s.zeit * 4) > -0.3;
        if (an) {
          ctx.fillStyle = '#f2b84b';
          for (const [cx, cy] of [[1, 2], [12, 2], [1, 13], [12, 13]]) {
            ctx.fillRect(rund(x + cx), rund(cy), rund(3), rund(1));
            ctx.fillRect(rund(x + cx + (cx > 6 ? 2 : 0)), rund(cy + (cy > 6 ? -2 : 0)), rund(1), rund(3));
          }
        }
      }
    });
  }

  function zeichneFrosch(s) {
    const f = s.frosch;
    if (!f || f.versteckt) return;
    if (s.zustand === ZUSTAND.UNFALL || s.zustand === ZUSTAND.ENDE) return;
    const a = froschAnsicht(s);
    const b = bilder.frosch[f.blick] || bilder.frosch.hoch;
    const springt = !!f.sprung;
    let groesse = 1;
    if (springt && !reduziert) groesse = 1 + Math.sin(a.p * Math.PI) * 0.18;
    if (f.erscheinen > 0) {
      const t = 1 - f.erscheinen / K.ERSCHEINEN_DAUER;
      if (reduziert) { if (Math.floor(t * 6) % 2) return; }
      else groesse *= 0.5 + 0.5 * t;
    }
    const cx = a.x * P;
    const cy = (a.y + 0.5) * P;
    const w = 16 * groesse;
    // Schatten beim Sprung
    if (springt) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(rund(cx - 5), rund(cy + 4), rund(10), rund(2));
    }
    bild(springt ? b.springt : b.sitzt, cx - w / 2, cy - w / 2 - (springt && !reduziert ? Math.sin(a.p * Math.PI) * 2 : 0), w, w);
  }

  function zeichneUnfall(s) {
    const u = s.unfall;
    if (!u || (s.zustand !== ZUSTAND.UNFALL && s.zustand !== ZUSTAND.PAUSE)) return;
    const cx = Math.max(6, Math.min(BREITE - 6, u.x * P));
    const cy = (u.reihe + 0.5) * P;
    if (u.art === 'auto') {
      bild(bilder.platt, cx - 8, cy - 8);
      // Sternchen kreisen
      const n = 3;
      for (let i = 0; i < n; i++) {
        const w = (reduziert ? 0 : u.zeit * 6) + (i * Math.PI * 2) / n;
        const sx = cx + Math.cos(w) * 7;
        const sy = cy - 9 + Math.sin(w) * 2;
        ctx.fillStyle = '#ffe36b';
        ctx.fillRect(rund(sx - 1), rund(sy), rund(3), rund(1));
        ctx.fillRect(rund(sx), rund(sy - 1), rund(1), rund(3));
      }
    }
  }

  function zeichneSpritzer() {
    for (const sp of spritzer) {
      const r = 2 + sp.t * 14;
      const alpha = Math.max(0, 1 - sp.t / 0.9);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      // pixeliger Ring
      const n = 14;
      for (let i = 0; i < n; i++) {
        const w = (i / n) * Math.PI * 2;
        ctx.fillRect(rund(sp.x + Math.cos(w) * r - 0.5), rund(sp.y + Math.sin(w) * r * 0.55 - 0.5), rund(1), rund(1));
      }
      if (sp.t < 0.4) {
        ctx.fillStyle = `rgba(127, 230, 224, ${alpha})`;
        ctx.fillRect(rund(sp.x - 2), rund(sp.y - 6 * (1 - sp.t)), rund(4), rund(4));
      }
    }
  }

  function zeichnePartikel() {
    for (const p of partikel) {
      ctx.fillStyle = p.farbe;
      ctx.globalAlpha = Math.min(1, p.leben * 2);
      ctx.fillRect(rund(p.x - 1), rund(p.y - 1), rund(2), rund(2));
    }
    ctx.globalAlpha = 1;
  }

  function zeichne(s) {
    if (!ctx) return;
    ctx.setTransform(skala, 0, 0, skala, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hintergrund, 0, 0);
    zeichneWasser(s);
    zeichneZiele(s);
    zeichneSpuren(s);
    // Der Frosch sitzt über den Plattformen, Fahrzeuge der eigenen Reihe sind darunter egal
    zeichneUnfall(s);
    zeichneFrosch(s);
    zeichneSpritzer();
    zeichnePartikel();
    if (s.zustand === ZUSTAND.START || s.zustand === ZUSTAND.ENDE) {
      ctx.fillStyle = 'rgba(10, 19, 48, 0.25)';
      ctx.fillRect(0, 0, BREITE, HOEHE);
    }
  }

  // Kleiner Frosch für das Startfenster und das App-Symbol
  function malFrosch(zielCanvas, springt) {
    const g = zielCanvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, zielCanvas.width, zielCanvas.height);
    const b = bilder.frosch.hoch[springt ? 'springt' : 'sitzt'];
    g.drawImage(b, 0, 0, zielCanvas.width, zielCanvas.height);
  }

  return { init, groesse, zeichne, zielEffekt, unfallEffekt, effekteSchritt, effekteLeeren, setzeReduziert, malFrosch, get skala() { return skala; } };
})();
