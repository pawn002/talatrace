#!/bin/bash
set -e
# An old postrm may run during upgrade: leave the new profile/launcher alone.
# dpkg owns the conffile and preserves administrator edits during upgrades.
case "$1" in remove|purge) ;; *) exit 0 ;; esac
profile='/etc/apparmor.d/talatrace'
if [ -r "$profile" ] && command -v apparmor_status >/dev/null && apparmor_status --enabled >/dev/null 2>&1; then
  if ! { [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; }; then
    apparmor_parser --remove "$profile" || true
  fi
fi
if command -v update-alternatives >/dev/null; then
  update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}' || true
elif [ "$(readlink '/usr/bin/${executable}')" = '/opt/${sanitizedProductName}/${executable}' ]; then
  rm -f '/usr/bin/${executable}'
fi
if command -v update-mime-database >/dev/null; then update-mime-database /usr/share/mime || true; fi
if command -v update-desktop-database >/dev/null; then update-desktop-database /usr/share/applications || true; fi
