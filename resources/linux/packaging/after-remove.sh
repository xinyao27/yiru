#!/bin/bash
# Why: remove the PATH symlink that after-install.sh created, but only if it
# still points into a Yiru install dir — never delete an unrelated
# /usr/bin/yiru a user or other package may own.
set -e

link="/usr/bin/yiru"

if [ -L "$link" ]; then
  target="$(readlink "$link" || true)"
  case "$target" in
    /opt/Yiru/*|/opt/yiru/*)
      rm -f "$link"
      ;;
  esac
fi

exit 0
