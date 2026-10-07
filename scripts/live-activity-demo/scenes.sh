#!/bin/bash
# Prints the timestamps of scene changes in a take (threshold $2, default 0.25),
# to pick the cut points for cuts.json. Usage: scenes.sh <take.mp4> [threshold]
ffmpeg -hide_banner -nostdin -i "$1" -vf "fps=30,select='gt(scene,${2:-0.25})',showinfo" -an -f null - 2>&1 | grep -oE "pts_time:[0-9.]+" | cut -d: -f2 | awk '{printf "%.2f ", $1} END {print ""}'
