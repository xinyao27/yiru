# Why: curl installs need platform detection, checksum verification, Native Messaging registration,
# and service activation; no package-manager one-liner can own that sequence safely.
set -eu

repository="xinyao27/yiru"
install_directory="${YIRU_INSTALL_DIR:-${HOME}/.local/bin}"
release_version="${YIRU_VERSION:-latest}"

case "$(uname -s)" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *)
    echo "Yiru's shell installer supports macOS and Linux; use npm on Windows." >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) architecture="arm64" ;;
  x86_64 | amd64) architecture="x64" ;;
  *)
    echo "Unsupported CPU architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

target="bun-${platform}-${architecture}"
if [ "$platform" = "linux" ] && { ldd --version 2>&1 || true; } | grep -qi musl; then
  target="${target}-musl"
fi
asset="yiru-${target}"
if [ "$release_version" = "latest" ]; then
  release_base="https://github.com/${repository}/releases/latest/download"
else
  case "$release_version" in v*) tag="$release_version" ;; *) tag="v${release_version}" ;; esac
  release_base="https://github.com/${repository}/releases/download/${tag}"
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM

download() {
  source_url="$1"
  destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error "$source_url" --output "$destination"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget --quiet "$source_url" --output-document "$destination"
    return
  fi
  echo "Install curl or wget, then retry." >&2
  exit 1
}

download "${release_base}/${asset}" "${temporary_directory}/${asset}"
download "${release_base}/yiru-checksums.txt" "${temporary_directory}/yiru-checksums.txt"
expected_checksum="$(awk -v name="$asset" '$2 == name { print $1 }' "${temporary_directory}/yiru-checksums.txt")"
if [ -z "$expected_checksum" ]; then
  echo "The release checksum list does not contain ${asset}." >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "${temporary_directory}/${asset}" | awk '{ print $1 }')"
else
  actual_checksum="$(shasum -a 256 "${temporary_directory}/${asset}" | awk '{ print $1 }')"
fi
if [ "$actual_checksum" != "$expected_checksum" ]; then
  echo "Checksum verification failed for ${asset}." >&2
  exit 1
fi

mkdir -p "$install_directory"
install -m 0755 "${temporary_directory}/${asset}" "${install_directory}/yiru"

setup_succeeded=1
if [ "${YIRU_SKIP_SERVICE_INSTALL:-0}" = "1" ]; then
  if ! "${install_directory}/yiru" install --no-service; then
    echo "Yiru was installed, but automatic setup did not complete; run 'yiru install --no-service' manually." >&2
    setup_succeeded=0
  fi
elif ! "${install_directory}/yiru" install; then
  echo "Yiru was installed, but automatic setup did not complete; run 'yiru install' manually." >&2
  setup_succeeded=0
fi

echo "Installed Yiru to ${install_directory}/yiru"
case ":${PATH}:" in
  *":${install_directory}:"*) ;;
  *) echo "Add ${install_directory} to PATH." ;;
esac
[ "$setup_succeeded" = "1" ] || exit 1
