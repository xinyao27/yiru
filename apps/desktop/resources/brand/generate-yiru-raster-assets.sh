#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
REPO_ROOT="$(dirname "$(dirname "$PROJECT_DIR")")"
MARK_SOURCE="$SCRIPT_DIR/yiru-mark.svg"
APP_ICON_SOURCE="$SCRIPT_DIR/yiru-app-icon.svg"
WARM_ICON_SOURCE="$SCRIPT_DIR/yiru-warm-app-icon.svg"
GRAPHITE_ICON_SOURCE="$SCRIPT_DIR/yiru-graphite-app-icon.svg"
SPLASH_ICON_SOURCE="$SCRIPT_DIR/yiru-splash-icon.svg"
DEV_ICON_SOURCE="$SCRIPT_DIR/yiru-dev-icon.svg"
MENU_BAR_ICON_SOURCE="$SCRIPT_DIR/yiru-menu-bar-template.svg"
TRANSPARENT_SVG_RENDERER="$SCRIPT_DIR/render-transparent-svg.swift"
README_HERO_SOURCE="$REPO_ROOT/docs/assets/yiru-hero.svg"
MOBILE_ASSETS_DIR="$REPO_ROOT/apps/mobile/assets"
APP_ICONS_DIR="$PROJECT_DIR/resources/app-icons"
TRAY_ASSETS_DIR="$PROJECT_DIR/resources/tray"
ONBOARDING_ASSETS_DIR="$PROJECT_DIR/resources/onboarding/feature-wall"

QLMANAGE_BIN=$(command -v qlmanage || true)
SWIFT_BIN=$(command -v swift || true)
if [ -z "$QLMANAGE_BIN" ]; then
  echo "Error: macOS Quick Look is required to render Yiru raster assets." >&2
  exit 1
fi
if [ -z "$SWIFT_BIN" ]; then
  echo "Error: Swift is required to render transparent Yiru raster assets." >&2
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

render_transparent_svg() {
  local source="$1"
  local width="$2"
  local height="$3"
  local output="$4"

  "$SWIFT_BIN" "$TRANSPARENT_SVG_RENDERER" "$source" "$width" "$height" "$output"
}

mkdir -p "$MOBILE_ASSETS_DIR" "$APP_ICONS_DIR" "$TRAY_ASSETS_DIR"

render_svg "$APP_ICON_SOURCE" 1024 "$MOBILE_ASSETS_DIR/icon.png"
render_svg "$MARK_SOURCE" 1024 "$MOBILE_ASSETS_DIR/adaptive-icon.png"
render_svg "$SPLASH_ICON_SOURCE" 400 "$TMP_DIR/yiru-splash-square.png"
sips --cropToHeightWidth 255 400 "$TMP_DIR/yiru-splash-square.png" \
  --out "$MOBILE_ASSETS_DIR/splash-icon.png" >/dev/null
render_svg "$APP_ICON_SOURCE" 48 "$MOBILE_ASSETS_DIR/favicon.png"
render_svg "$WARM_ICON_SOURCE" 1024 "$APP_ICONS_DIR/yiru-warm.png"
render_svg "$GRAPHITE_ICON_SOURCE" 1024 "$APP_ICONS_DIR/yiru-graphite.png"
# Why: Quick Look flattens transparent margins, which makes the dev Dock icon
# render as an oversized square instead of matching the production icon bounds.
render_transparent_svg "$DEV_ICON_SOURCE" 256 256 "$PROJECT_DIR/resources/icon-dev.png"
# Why: Quick Look flattens SVG transparency against white, but macOS template
# images need alpha-only backgrounds so the system can tint them correctly.
render_transparent_svg \
  "$MENU_BAR_ICON_SOURCE" 22 14 "$TRAY_ASSETS_DIR/yiru-menu-barTemplate.png"
render_transparent_svg \
  "$MENU_BAR_ICON_SOURCE" 44 28 "$TRAY_ASSETS_DIR/yiru-menu-barTemplate@2x.png"

# Why: these recordings exposed the previous brand in pixels. Keep packaged
# onboarding honest until each workflow is recorded again under Yiru.
render_svg "$README_HERO_SOURCE" 960 "$TMP_DIR/yiru-feature-card-square.png"
sips --cropToHeightWidth 540 960 "$TMP_DIR/yiru-feature-card-square.png" \
  --out "$TMP_DIR/yiru-feature-card.png" >/dev/null
for tile in 06 07 09 10 12; do
  sips -s format jpeg "$TMP_DIR/yiru-feature-card.png" \
    --out "$ONBOARDING_ASSETS_DIR/tile-$tile.poster.jpg" >/dev/null
  sips -s format gif "$TMP_DIR/yiru-feature-card.png" \
    --out "$ONBOARDING_ASSETS_DIR/tile-$tile.gif" >/dev/null
done

echo "Generated Yiru app, mobile, menu bar, onboarding, favicon, splash, and development assets."
