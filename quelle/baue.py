#!/usr/bin/env python3
# Baut aus den Teilen in diesem Ordner die fertige index.html. Aufruf: python3 quelle/baue.py
import pathlib
q = pathlib.Path(__file__).parent
TEILE = ['1-einstellungen.js', '2-logik.js', '3-speicher.js', '4-ton.js', '5-grafik.js', '6-eingabe.js', '7-app.js']
kopf = (q / 'kopf.html').read_text()
spiel = '\n'.join((q / n).read_text() for n in TEILE)
fertig = kopf.replace('%%SCHRIFT%%', (q / 'schrift.txt').read_text().strip()).replace('%%SPIEL%%', spiel)
(q.parent / 'index.html').write_text(fertig)
print('index.html:', len(fertig) // 1024, 'KB')
