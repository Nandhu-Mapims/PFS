#!/bin/sh
set -e

UPLOADS="/app/uploads"
BUNDLED="/app/uploads-bundled"

mkdir -p "$UPLOADS/feedback-voice" "$UPLOADS/feedback-voice/ai_voice"

# Seed the persistent volume from files baked into the image (repo uploads).
# cp -n = never overwrite — safe on every container restart.
if [ -d "$BUNDLED" ]; then
  cp -rn "$BUNDLED"/. "$UPLOADS/" 2>/dev/null || true
fi

exec node src/index.js
