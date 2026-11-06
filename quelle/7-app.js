// ===================================================================
// 7 · APP
// Verbindet Logik, Grafik, Ton, Eingabe und Speicher. Eine einzige Spielschleife,
// alle Listener werden genau einmal eingerichtet.
// ===================================================================

(() => {
  const $ = id => document.getElementById(id);
  const wurzel = document.documentElement;
  const app = $('app');
  const canvas = $('bild');
  const rahmen = $('rahmen');
  const buehne = $('buehne');
  const fenster = $('fenster');
  const meldung = $('meldung');

  const s = erstelleSpiel();
  let rekord = Speicher.rekord();

  // ---------- Grafik, Ton, Bewegung ----------
  Grafik.init(canvas);
  Grafik.malFrosch($('startFrosch'));
  const wenigBewegung = window.matchMedia('(prefers-reduced-motion: reduce)');
  Grafik.setzeReduziert(wenigBewegung.matches);
  wenigBewegung.addEventListener?.('change', e => Grafik.setzeReduziert(e.matches));

  Ton.setze(Speicher.tonAn(), false);
  function zeigeTon() {
    const an = Ton.istAn();
    wurzel.classList.toggle('stumm', !an);
    $('tonKnopf').setAttribute('aria-pressed', String(an));
    $('tonKnopf').setAttribute('aria-label', an ? 'Ton ausschalten' : 'Ton einschalten');
  }
  zeigeTon();
  $('tonKnopf').addEventListener('click', () => {
    Ton.setze(!Ton.istAn(), true);
    Speicher.setzeTon(Ton.istAn());
    zeigeTon();
  });

  // ---------- Touch erkennen (Steuerkreuz und Hinweise) ----------
  function aufTouch() {
    if (!wurzel.classList.contains('touch')) {
      wurzel.classList.add('touch');
      passeGroesseAn();
    }
  }
  if (window.matchMedia('(any-pointer: coarse)').matches) wurzel.classList.add('touch');
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') aufTouch(); }, { capture: true, passive: true });

  // ---------- Größe ----------
  let groesseGeplant = false;
  function passeGroesseAn() {
    groesseGeplant = false;
    const stil = getComputedStyle(buehne);
    const w = buehne.clientWidth - parseFloat(stil.paddingLeft) - parseFloat(stil.paddingRight);
    const h = buehne.clientHeight - parseFloat(stil.paddingTop) - parseFloat(stil.paddingBottom);
    if (w <= 0 || h <= 0) return;
    const { cssW, cssH } = Grafik.groesse(w, h, window.devicePixelRatio || 1);
    rahmen.style.width = cssW + 'px';
    rahmen.style.height = cssH + 'px';
    Grafik.zeichne(s);
  }
  function planeGroesse() {
    if (groesseGeplant) return;
    groesseGeplant = true;
    requestAnimationFrame(passeGroesseAn);
  }
  if ('ResizeObserver' in window) new ResizeObserver(planeGroesse).observe(buehne);
  window.addEventListener('resize', planeGroesse);
  window.addEventListener('orientationchange', planeGroesse);
  passeGroesseAn();

  // ---------- Fenster (Start, Pause, Ende) ----------
  function zeigeFenster(id) {
    for (const sec of fenster.querySelectorAll('section')) sec.hidden = sec.id !== id;
    fenster.hidden = !id;
    app.inert = !!id;
    if (id) {
      const sec = $(id);
      const titel = sec.querySelector('[data-titel]');
      fenster.querySelectorAll('[data-titel]').forEach(t => t.removeAttribute('id'));
      titel.id = 'fensterTitel';
      const knopf = sec.querySelector('.btn.main');
      if (knopf) knopf.focus({ preventScroll: true });
    } else {
      canvas.focus({ preventScroll: true });
    }
  }

  function starteSpiel() {
    Ton.wecke();
    Grafik.effekteLeeren();
    neuStart(s);
    versteckeMeldung();
    zeigeFenster(null);
  }

  function pause() {
    if (!pausiere(s)) return false;
    $('pausePunkte').textContent = s.punkte;
    zeigeFenster('fPause');
    return true;
  }
  function weiter() {
    Ton.wecke();
    if (setzeFort(s)) zeigeFenster(null);
  }

  $('losKnopf').addEventListener('click', starteSpiel);
  $('nochmalKnopf').addEventListener('click', starteSpiel);
  $('neuKnopf').addEventListener('click', starteSpiel);
  $('weiterKnopf').addEventListener('click', weiter);
  $('pauseKnopf').addEventListener('click', pause);

  // Anderer Tab oder App im Hintergrund: automatisch pausieren, weiter geht es nur per Knopf
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('pagehide', () => {
    if (s.punkte > rekord) Speicher.setzeRekord(s.punkte);
  });

  // ---------- Eingabe ----------
  const spielAktiv = () => s.zustand === ZUSTAND.SPIELEN || s.zustand === ZUSTAND.UNFALL || s.zustand === ZUSTAND.LEVELWECHSEL;
  Eingabe.init({
    canvas,
    steuer: $('steuer'),
    beiRichtung: r => { Ton.wecke(); eingabe(s, r); },
    beiPause: () => {
      if (s.zustand === ZUSTAND.PAUSE) { weiter(); return true; }
      return pause();
    },
    spielAktiv,
    kachelBreite: () => rahmen.clientWidth / K.SPALTEN,
    beiTouch: aufTouch,
  });

  // ---------- Kurze Meldungen auf dem Spielfeld ----------
  let meldungRest = 0;
  function zeigeMeldung(text, klein, art, dauer) {
    meldung.innerHTML = '';
    meldung.append(text);
    if (klein) {
      const k = document.createElement('small');
      k.textContent = klein;
      meldung.append(k);
    }
    meldung.className = art || '';
    meldung.hidden = false;
    meldungRest = dauer;
  }
  function versteckeMeldung() {
    meldung.hidden = true;
    meldungRest = 0;
  }

  // ---------- Ereignisse aus der Logik ----------
  const UNFALL_TEXT = { auto: 'AUTSCH!', wasser: 'PLATSCH!', abgetrieben: 'ABGETRIEBEN!' };

  function verarbeiteEreignisse() {
    if (!s.ereignisse.length) return;
    const liste = s.ereignisse.splice(0);
    for (const e of liste) {
      switch (e.typ) {
        case 'sprung': Ton.sprung(); break;
        case 'blockiert':
          Ton.blockiert();
          if (e.besetzt) zeigeMeldung('SCHON BESETZT', null, '', 0.7);
          break;
        case 'ziel':
          Ton.ziel();
          Grafik.zielEffekt(e.spalte);
          if (s.zustand !== ZUSTAND.LEVELWECHSEL) zeigeMeldung(`+${K.PUNKTE_ZIEL}`, `Noch ${s.ziele.filter(z => !z).length} Ziele`, 'gut', 0.9);
          break;
        case 'unfall':
          if (e.art === 'auto') Ton.auto(); else Ton.wasser();
          Grafik.unfallEffekt(e.art, e.x, e.reihe);
          zeigeMeldung(UNFALL_TEXT[e.art] || 'AUTSCH!', s.leben > 0 ? (s.leben === 1 ? 'Noch 1 Leben' : `Noch ${s.leben} Leben`) : 'Keine Leben mehr', 'schlecht', K.UNFALL_DAUER);
          break;
        case 'neuerFrosch': versteckeMeldung(); break;
        case 'levelgeschafft':
          Ton.level();
          zeigeMeldung(`LEVEL ${e.level} GESCHAFFT!`, `+${K.PUNKTE_LEVEL} Bonus`, 'gut', K.LEVELWECHSEL_DAUER);
          break;
        case 'levelstart':
          zeigeMeldung(`LEVEL ${e.level}`, 'Etwas schneller!', 'gut', 1.1);
          break;
        case 'ende': spielEnde(); break;
      }
    }
  }

  function spielEnde() {
    Ton.ende();
    versteckeMeldung();
    const neu = s.punkte > rekord;
    if (neu) {
      rekord = s.punkte;
      Speicher.setzeRekord(rekord);
    }
    $('ePunkte').textContent = s.punkte;
    $('eRekord').textContent = rekord;
    $('eLevel').textContent = s.level;
    $('eFelder').textContent = s.felder;
    $('neuerRekord').hidden = !neu;
    zeigeFenster('fEnde');
  }

  // ---------- Anzeige ----------
  const anzeige = {};
  function setze(id, wert) {
    if (anzeige[id] === wert) return;
    anzeige[id] = wert;
    $(id).textContent = wert;
  }
  function aktualisiereHud() {
    setze('punkte', s.punkte);
    setze('leben', s.leben);
    setze('level', s.level);
    setze('felder', s.felder);
    setze('rekord', Math.max(rekord, s.punkte));
    if (anzeige.lebenLabel !== s.leben) {
      anzeige.lebenLabel = s.leben;
      $('lebenWert').setAttribute('aria-label', `${s.leben} Leben`);
    }
    for (const el of document.querySelectorAll('.js-rekord')) el.textContent = rekord;
  }

  // ---------- Die eine Spielschleife ----------
  let letzte = null;
  let rest = 0;
  function bild(jetzt) {
    requestAnimationFrame(bild);
    let dt = letzte === null ? 0 : (jetzt - letzte) / 1000;
    letzte = jetzt;
    if (!(dt >= 0)) dt = 0;
    if (dt > K.MAX_FRAME) dt = K.MAX_FRAME;   // nach Tabwechsel oder Ruckler kein Riesensprung

    if (s.zustand !== ZUSTAND.PAUSE) {
      rest += dt;
      let n = 0;
      while (rest >= K.SCHRITT && n < 30) {
        schritt(s, K.SCHRITT);
        rest -= K.SCHRITT;
        n++;
      }
      if (n >= 30) rest = 0;
      Grafik.effekteSchritt(dt);
      if (meldungRest > 0) {
        meldungRest -= dt;
        if (meldungRest <= 0) versteckeMeldung();
      }
    } else {
      rest = 0;
    }
    verarbeiteEreignisse();
    aktualisiereHud();
    Grafik.zeichne(s);
  }

  zeigeFenster('fStart');
  aktualisiereHud();
  requestAnimationFrame(bild);

  // Offline-Fähigkeit wie bei den anderen Pixelhafen-Spielen
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Für automatische Tests (nur mit ?test in der Adresse)
  if (/[?&]test\b/.test(location.search)) {
    window.froschsprung = { s, K, eingabe, schritt, ZUSTAND, objektX, spurInReihe, Grafik, get rekord() { return rekord; } };
  }
})();
