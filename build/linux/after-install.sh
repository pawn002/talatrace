#!/bin/bash
# Adapted from electron-builder 25.1.8's MIT-licensed Linux integration template.
set -e
install_root='/opt/${sanitizedProductName}'
sandbox="$install_root/chrome-sandbox"
profile='/etc/apparmor.d/talatrace'

# Root's successful unshare does not establish ordinary users' AppArmor access.
if [ ! -f "$sandbox" ] || [ -L "$sandbox" ]; then
  echo 'TalaTrace: missing or invalid Chromium sandbox helper.' >&2
  exit 1
fi
chown root:root "$sandbox"
chmod 4755 "$sandbox"
test -r "$profile"
if command -v apparmor_status >/dev/null && apparmor_status --enabled >/dev/null 2>&1; then
  apparmor_parser --skip-kernel-load --skip-read-cache "$profile"
  if ! { [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; }; then
    apparmor_parser --replace --write-cache --skip-read-cache "$profile"
  fi
fi

if command -v update-alternatives >/dev/null; then
  if [ -L '/usr/bin/${executable}' ] && [ "$(readlink '/usr/bin/${executable}')" != '/etc/alternatives/${executable}' ]; then
    rm -f '/usr/bin/${executable}'
  fi
  update-alternatives --install '/usr/bin/${executable}' '${executable}' "$install_root/${executable}" 100
else
  ln -sf "$install_root/${executable}" '/usr/bin/${executable}'
fi
if command -v update-mime-database >/dev/null; then update-mime-database /usr/share/mime || true; fi
if command -v update-desktop-database >/dev/null; then update-desktop-database /usr/share/applications || true; fi
