#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
REPO_ROOT="$(dirname "$(dirname "$PROJECT_DIR")")"
DERIVE_ASSETS_SCRIPT="$SCRIPT_DIR/derive-yiru-assets.mjs"
README_HERO_SOURCE="$REPO_ROOT/docs/assets/yiru-hero.png"
APP_ICONS_DIR="$PROJECT_DIR/resources/app-icons"
TRAY_ASSETS_DIR="$PROJECT_DIR/resources/tray"
WEB_PUBLIC_DIR="$REPO_ROOT/packages/client/src/public"
SITE_PUBLIC_DIR="$REPO_ROOT/apps/web/public"

mkdir -p "$APP_ICONS_DIR" "$TRAY_ASSETS_DIR" "$WEB_PUBLIC_DIR" "$SITE_PUBLIC_DIR"

node "$DERIVE_ASSETS_SCRIPT"

# Why: the landing page's og:image is this same artwork, but social scrapers want
# at least 1200px wide and the hero is only shipped at README size. JPEG rather
# than PNG because a full-bleed gradient costs 925 kB losslessly against 133 kB
# here. Derived from the hero so a brand change reaches yiru.ai instead of
# leaving a stale card behind.
sips -s format jpeg -s formatOptions 90 --resampleWidth 1200 "$README_HERO_SOURCE" \
  --out "$SITE_PUBLIC_DIR/og.jpg" >/dev/null

echo "Generated Yiru app, tray, favicon, landing, and development assets."
