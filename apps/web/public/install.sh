#!/bin/sh
set -eu

RELEASE_API='https://api.github.com/repos/xinyao27/yiru/releases/latest'
INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/yiru"
BIN_ROOT="${XDG_BIN_HOME:-$HOME/.local/bin}"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/yiru-install.XXXXXX")"
STAGED_INSTALL=''

cleanup() {
  if [ "$(uname -s)" = 'Darwin' ] && mount | grep -q "$TEMP_ROOT/mount"; then
    hdiutil detach "$TEMP_ROOT/mount" -quiet >/dev/null 2>&1 || true
  fi
  if [ -n "$STAGED_INSTALL" ]; then
    rm -rf "$STAGED_INSTALL"
  fi
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

download_verified_asset() {
  asset_name="$1"
  output_path="$2"
  if ! command -v perl >/dev/null 2>&1; then
    echo 'Perl is required to verify the Yiru release checksum.' >&2
    exit 1
  fi
  if [ ! -f "$TEMP_ROOT/release.json" ]; then
    curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' \
      "$RELEASE_API" -o "$TEMP_ROOT/release.json"
  fi
  expected_digest="$(
    YIRU_ASSET_NAME="$asset_name" perl -MJSON::PP -0777 -ne '
      $release = decode_json($_);
      ($asset) = grep { $_->{name} eq $ENV{YIRU_ASSET_NAME} } @{$release->{assets}};
      exit 1 unless $asset && $asset->{digest} =~ /^sha256:([0-9a-f]{64})$/;
      print $1;
    ' "$TEMP_ROOT/release.json"
  )" || {
    echo "The latest Yiru release does not publish a SHA-256 digest for $asset_name." >&2
    exit 1
  }
  asset_url="$(
    YIRU_ASSET_NAME="$asset_name" perl -MJSON::PP -0777 -ne '
      $release = decode_json($_);
      ($asset) = grep { $_->{name} eq $ENV{YIRU_ASSET_NAME} } @{$release->{assets}};
      exit 1 unless $asset && $asset->{browser_download_url};
      print $asset->{browser_download_url};
    ' "$TEMP_ROOT/release.json"
  )" || {
    echo "The latest Yiru release does not include $asset_name." >&2
    exit 1
  }
  case "$asset_url" in
    "https://github.com/xinyao27/yiru/releases/download/"*) ;;
    *) echo 'GitHub returned an unexpected Yiru release asset URL.' >&2; exit 1 ;;
  esac
  # Why: the latest-release alias can move between metadata and download. The
  # asset URL captured above contains the exact release tag whose digest we read.
  curl -fL --retry 3 "$asset_url" -o "$output_path"
  case "$(uname -s)" in
    Darwin) actual_digest="$(shasum -a 256 "$output_path" | awk '{print $1}')" ;;
    Linux) actual_digest="$(sha256sum "$output_path" | awk '{print $1}')" ;;
  esac
  if [ "$actual_digest" != "$expected_digest" ]; then
    echo "The SHA-256 checksum for $asset_name did not match its GitHub release digest." >&2
    exit 1
  fi
}

replace_install() {
  staged_path="$1"
  target_path="$2"
  backup_path="$target_path.previous.$$"
  if [ -e "$target_path" ]; then
    mv "$target_path" "$backup_path"
  fi
  if mv "$staged_path" "$target_path"; then
    STAGED_INSTALL=''
    if [ -e "$backup_path" ]; then
      rm -rf "$backup_path"
    fi
    return
  fi
  if [ -e "$backup_path" ]; then
    mv "$backup_path" "$target_path"
  fi
  echo 'Yiru could not replace the existing installation.' >&2
  exit 1
}

install_launcher() {
  target_path="$1"
  assert_launcher_available
  ln -sfn "$target_path" "$BIN_ROOT/yiru"
}

assert_launcher_available() {
  launcher_path="$BIN_ROOT/yiru"
  if [ ! -e "$launcher_path" ] && [ ! -L "$launcher_path" ]; then
    return
  fi
  current_target="$(readlink "$launcher_path" 2>/dev/null || true)"
  case "$current_target" in
    "$INSTALL_ROOT"/*) ;;
    *)
      echo "$launcher_path already exists and is not managed by this installer." >&2
      exit 1
      ;;
  esac
}

install_macos() {
  machine_arch="$(uname -m)"
  case "$machine_arch" in
    arm64) asset='yiru-macos-arm64.dmg' ;;
    x86_64) asset='yiru-macos-x64.dmg' ;;
    *) echo "Yiru does not provide a macOS build for $machine_arch." >&2; exit 1 ;;
  esac

  download_verified_asset "$asset" "$TEMP_ROOT/yiru.dmg"
  mkdir -p "$TEMP_ROOT/mount" "$INSTALL_ROOT"
  hdiutil attach "$TEMP_ROOT/yiru.dmg" -nobrowse -readonly -mountpoint "$TEMP_ROOT/mount" -quiet
  app_path="$(find "$TEMP_ROOT/mount" -maxdepth 1 -name '*.app' -type d | head -n 1)"
  if [ -z "$app_path" ]; then
    echo 'The Yiru disk image did not contain an application.' >&2
    exit 1
  fi
  codesign --verify --deep --strict "$app_path"
  spctl --assess --type execute "$app_path"
  STAGED_INSTALL="$INSTALL_ROOT/.Yiru.app.new.$$"
  ditto "$app_path" "$STAGED_INSTALL"
  replace_install "$STAGED_INSTALL" "$INSTALL_ROOT/Yiru.app"
  hdiutil detach "$TEMP_ROOT/mount" -quiet
  install_launcher "$INSTALL_ROOT/Yiru.app/Contents/Resources/bin/yiru"
}

install_linux() {
  machine_arch="$(uname -m)"
  case "$machine_arch" in
    x86_64|amd64) asset='yiru-linux.AppImage' ;;
    aarch64|arm64) asset='yiru-linux-arm64.AppImage' ;;
    *) echo "Yiru does not provide a Linux build for $machine_arch." >&2; exit 1 ;;
  esac

  download_verified_asset "$asset" "$TEMP_ROOT/yiru.AppImage"
  chmod 700 "$TEMP_ROOT/yiru.AppImage"
  mkdir -p "$TEMP_ROOT/extract" "$INSTALL_ROOT"
  (
    cd "$TEMP_ROOT/extract"
    "$TEMP_ROOT/yiru.AppImage" --appimage-extract >/dev/null
  )
  if [ ! -x "$TEMP_ROOT/extract/squashfs-root/resources/bin/yiru" ]; then
    echo 'The Yiru AppImage did not contain the CLI launcher.' >&2
    exit 1
  fi
  STAGED_INSTALL="$INSTALL_ROOT/.app.new.$$"
  mv "$TEMP_ROOT/extract/squashfs-root" "$STAGED_INSTALL"
  replace_install "$STAGED_INSTALL" "$INSTALL_ROOT/app"
  install_launcher "$INSTALL_ROOT/app/resources/bin/yiru"
}

mkdir -p "$BIN_ROOT"
assert_launcher_available
case "$(uname -s)" in
  Darwin) install_macos ;;
  Linux) install_linux ;;
  *) echo 'The Yiru install script supports macOS and Linux.' >&2; exit 1 ;;
esac

echo "Yiru was installed at $INSTALL_ROOT."
case ":$PATH:" in
  *":$BIN_ROOT:"*) echo 'Run: yiru connect' ;;
  *) echo "Add $BIN_ROOT to PATH, then run: yiru connect" ;;
esac
