#!/bin/bash
# Why: register the bundled `yiru` CLI on PATH at package-install time.
# The in-app "Install CLI" action (CliInstaller) can never run on a headless
# server, so without this symlink `yiru serve` is unreachable from the shell on
# the exact hosts that need it most. deb/rpm both run this after unpacking.
#
# The shim resolves the real app by walking up from its own location, so a
# symlink works. We discover the install dir instead of hardcoding /opt/Yiru
# because electron-builder's directory name can vary by productName sanitization.
set -e

link="/usr/bin/yiru"

for dir in /opt/Yiru /opt/yiru; do
  sandbox="$dir/chrome-sandbox"
  if [ -f "$sandbox" ]; then
    # Why: packaged Linux installs must leave Chromium's sandbox helper usable
    # on hosts where unprivileged user namespaces are unavailable.
    chmod 4755 "$sandbox" || true
  fi

  shim="$dir/resources/bin/yiru"
  if [ -x "$shim" ]; then
    # Only manage our own symlink; never clobber an unrelated /usr/bin/yiru.
    if [ ! -e "$link" ] || [ -L "$link" ]; then
      ln -sf "$shim" "$link"
    fi
    break
  fi
done

exit 0
