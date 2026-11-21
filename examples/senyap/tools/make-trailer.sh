#!/usr/bin/env bash
# Builds the promo clips for one language: a 16:9 trailer and a 9:16 one for TikTok, Reels and Shorts.
#   tools/make-trailer.sh ms     (or en, id)     -> promo/senyap-trailer-<lang>.mp4, promo/senyap-trailer-<lang>-vertical.mp4
# Needs Node with Playwright (and its Chromium) and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
lang="${1:-ms}"
work="promo/work-$lang"
mkdir -p promo "$work"
node build.mjs
node tools/record-trailer.cjs "$lang" "$work"
node tools/trailer-banner.cjs "$lang" "$work/banner.png"
ffmpeg -y -v error -framerate 30 -i "$work/f/%05d.jpg" -i "$work/audio.wav" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart \
  "promo/senyap-trailer-$lang.mp4"
ffmpeg -y -v error -i "promo/senyap-trailer-$lang.mp4" -i "$work/banner.png" -filter_complex \
  "[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:2,eq=brightness=-0.25[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v];[v][1:v]overlay=0:0" \
  -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -c:a copy -movflags +faststart \
  "promo/senyap-trailer-$lang-vertical.mp4"
echo "promo/senyap-trailer-$lang.mp4"
