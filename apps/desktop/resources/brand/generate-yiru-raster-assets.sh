#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
REPO_ROOT="$(dirname "$(dirname "$PROJECT_DIR")")"
ADAPTIVE_BACKGROUND_SOURCE="$SCRIPT_DIR/yiru-adaptive-background.svg"
DERIVE_ASSETS_SCRIPT="$SCRIPT_DIR/derive-yiru-assets.mjs"
README_HERO_SOURCE="$REPO_ROOT/docs/assets/yiru-hero.png"
MOBILE_ASSETS_DIR="$REPO_ROOT/apps/mobile/assets"
APP_ICONS_DIR="$PROJECT_DIR/resources/app-icons"
TRAY_ASSETS_DIR="$PROJECT_DIR/resources/tray"
WEB_PUBLIC_DIR="$PROJECT_DIR/src/renderer/public"
ONBOARDING_ASSETS_DIR="$PROJECT_DIR/resources/onboarding/feature-wall"

QLMANAGE_BIN=$(command -v qlmanage || true)
if [ -z "$QLMANAGE_BIN" ]; then
  echo "Error: macOS Quick Look is required to render Yiru raster assets." >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

render_svg() {
  local source="$1"
  local size="$2"
  local output="$3"
  local rendered="$TMP_DIR/$(basename "$source").png"

  "$QLMANAGE_BIN" -t -s "$size" -o "$TMP_DIR" "$source" >/dev/null
  mv "$rendered" "$output"
}

mkdir -p "$MOBILE_ASSETS_DIR" "$APP_ICONS_DIR" "$TRAY_ASSETS_DIR" "$WEB_PUBLIC_DIR"

render_svg "$ADAPTIVE_BACKGROUND_SOURCE" 1024 "$MOBILE_ASSETS_DIR/adaptive-icon-background.png"
node "$DERIVE_ASSETS_SCRIPT"

# Why: these recordings exposed the previous brand in pixels. Keep packaged
# onboarding honest until each workflow is recorded again under Yiru.
sips -s format png --resampleWidth 960 "$README_HERO_SOURCE" \
  --out "$TMP_DIR/yiru-feature-card.png" >/dev/null
for tile in 06 07 09 10 12; do
  sips -s format jpeg "$TMP_DIR/yiru-feature-card.png" \
    --out "$ONBOARDING_ASSETS_DIR/tile-$tile.poster.jpg" >/dev/null
  sips -s format gif "$TMP_DIR/yiru-feature-card.png" \
    --out "$ONBOARDING_ASSETS_DIR/tile-$tile.gif" >/dev/null
done

echo "Generated Yiru app, mobile, tray, onboarding, favicon, splash, and development assets."
