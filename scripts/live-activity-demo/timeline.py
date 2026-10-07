#!/usr/bin/env python3
"""Prints a take's transitions: frame-to-frame scene scores above a floor (10
fps) and the stretches where the screen is black (screen off), to pick the
cut points for cuts.json. Usage: timeline.py <take.mp4> [floor=0.03]"""
import re, subprocess, sys
path = sys.argv[1]
floor = float(sys.argv[2]) if len(sys.argv) > 2 else 0.03
out = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-i', path, '-vf',
    "fps=10,select='gte(scene,0)',signalstats,metadata=print:file=-", '-an', '-f', 'null', '-'],
    capture_output=True, text=True).stdout
t = None; scene = None; rows = []
for line in out.splitlines():
    m = re.search(r'pts_time:([0-9.]+)', line)
    if m: t = float(m.group(1)); continue
    m = re.search(r'lavfi.scene_score=([0-9.]+)', line)
    if m: scene = float(m.group(1)); continue
    m = re.search(r'lavfi.signalstats.YAVG=([0-9.]+)', line)
    if m and t is not None: rows.append((t, scene or 0.0, float(m.group(1))))
peaks = [(round(t, 1), round(s, 2)) for t, s, _ in rows if s >= floor]
black = [round(t, 1) for t, _, y in rows if y < 18]
print(f"{path.split('/')[-1]} dur={rows[-1][0]:.1f}s")
print('  changes:', ' '.join(f'{t}@{s}' for t, s in peaks))
if black: print(f'  black: {black[0]}–{black[-1]} ({len(black)} frames)')
