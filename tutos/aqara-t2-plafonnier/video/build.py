#!/usr/bin/env python3
"""Fabrique la vidéo tuto : voix off (Piper, voix fr_FR-siwis), images (Playwright), montage (ffmpeg).

Usage :
  pip install piper-tts
  python3 build.py --voice fr_FR-siwis-medium.onnx --work /tmp/t2-build --out ../aqara-t2-plafonnier-tuto.mp4
"""
import argparse, json, subprocess, wave, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
LEAD, GAP, TAIL = 0.6, 0.35, 1.0   # silences (s) : début de scène, entre phrases, fin de scène

ap = argparse.ArgumentParser()
ap.add_argument('--voice', required=True)
ap.add_argument('--work', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--speed', type=float, default=0.97, help='length_scale Piper (<1 = plus rapide)')
args = ap.parse_args()

work = pathlib.Path(args.work); (work / 'tts').mkdir(parents=True, exist_ok=True)
script = json.loads((HERE / 'script.json').read_text())

rate = None
pcm = bytearray()
def silence(sec):
    return b'\x00\x00' * int(round(sec * rate))

timeline = {'scenes': []}
for si, sc in enumerate(script):
    starts, caps, chunks = [], [], []
    t = LEAD
    for li, line in enumerate(sc['lines']):
        wav = work / 'tts' / f'{si:02d}_{li:02d}.wav'
        if not wav.exists():
            subprocess.run([sys.executable, '-m', 'piper', '-m', args.voice, '--length-scale', str(args.speed), '-f', str(wav)],
                           input=line.get('say', line['t']).encode(), check=True, capture_output=True)
        with wave.open(str(wav)) as w:
            rate = rate or w.getframerate()
            data = w.readframes(w.getnframes())
            dur = w.getnframes() / w.getframerate()
        starts.append(t - (LEAD if li == 0 else 0))  # le sous-titre 1 s'affiche dès le début de la scène
        caps.append(line['t'])
        chunks.append((t, data))
        t += dur + GAP
    duration = t - GAP + TAIL
    seg = bytearray(silence(duration))
    for st, data in chunks:
        o = int(round(st * rate)) * 2
        seg[o:o + len(data)] = data
    pcm += seg
    timeline['scenes'].append({'id': sc['id'], 'starts': [round(s, 3) for s in starts], 'captions': caps, 'duration': round(len(seg) / 2 / rate, 4)})

with wave.open(str(work / 'voix.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(bytes(pcm))
(work / 'timeline.json').write_text(json.dumps(timeline, ensure_ascii=False, indent=1))
total = sum(s['duration'] for s in timeline['scenes'])
print(f'Voix off : {total:.1f} s')

subprocess.run(['node', str(HERE / 'capture.js'), str(work / 'timeline.json'), str(work / 'frames')], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error',
                '-f', 'concat', '-safe', '0', '-i', str(work / 'frames' / 'concat.txt'),
                '-i', str(work / 'voix.wav'),
                '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-tune', 'stillimage',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-shortest', '-movflags', '+faststart', args.out], check=True)
print('Vidéo :', args.out)
