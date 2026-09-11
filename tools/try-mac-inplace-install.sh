#!/usr/bin/env bash
#
# Rehearses the macOS in-place install against a throwaway copy.
#
# `main/macInstall.ts` mounts a disk image, copies the bundle inside it next to
# the installed app and swaps the two. That first runs for real when someone
# updates from 0.2.4 to whatever comes next — too late to find out that hdiutil
# prints something unexpected on a particular macOS. This runs the same four
# commands against a copy in a temporary folder, so the mechanics can be checked
# on a real Mac without touching /Applications.
#
# Usage:
#   tools/try-mac-inplace-install.sh ~/Downloads/BlinkBlink-0.2.3-arm64.dmg
#
# It never writes outside its own temporary directory.

set -euo pipefail

DMG="${1:-}"
if [ -z "$DMG" ] || [ ! -f "$DMG" ]; then
    echo "usage: $0 <path to a BlinkBlink .dmg>" >&2
    exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/blinkblink-install-rehearsal.XXXXXX")"
INSTALLED="$WORK/BlinkBlink.app"
STAGING="$INSTALLED.new-$$"
RETIRED="$INSTALLED.old-$$"
MOUNT=""

cleanup() {
    [ -n "$MOUNT" ] && hdiutil detach "$MOUNT" -quiet 2>/dev/null || true
    echo
    echo "Working directory left at: $WORK"
    echo "Remove it with: rm -rf \"$WORK\""
}
trap cleanup EXIT

echo "1. Mounting the disk image"
PLIST=$(hdiutil attach "$DMG" -nobrowse -noautoopen -readonly -plist)
MOUNT=$(printf '%s' "$PLIST" | grep -A1 '<key>mount-point</key>' | tail -1 | sed -E 's/.*<string>(.*)<\/string>.*/\1/')
if [ -z "$MOUNT" ] || [ ! -d "$MOUNT" ]; then
    echo "   FAILED: no mount point in hdiutil's output — this is the parse macInstall.ts does" >&2
    exit 1
fi
echo "   mounted at $MOUNT"

SOURCE="$MOUNT/BlinkBlink.app"
if [ ! -d "$SOURCE" ]; then
    echo "   FAILED: no BlinkBlink.app inside the image" >&2
    exit 1
fi

echo "2. Reading the bundle's identifier and version"
PLIST_PATH="$SOURCE/Contents/Info.plist"
ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST_PATH" 2>/dev/null || echo '')
VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST_PATH" 2>/dev/null || echo '')
echo "   identifier: ${ID:-<missing>}"
echo "   version:    ${VERSION:-<missing>}"
if [ "$ID" != "blinkblink" ]; then
    echo "   FAILED: the app refuses anything whose identifier is not 'blinkblink'" >&2
    exit 1
fi

echo "3. Pretending the copy is already installed"
ditto "$SOURCE" "$INSTALLED"

echo "4. Copying the new bundle beside it (ditto)"
ditto "$SOURCE" "$STAGING"

echo "5. Clearing the quarantine flag (xattr -cr)"
xattr -cr "$STAGING"
REMAINING=$(xattr -r "$STAGING" 2>/dev/null | wc -l | tr -d ' ')
echo "   extended attributes left: $REMAINING"

echo "6. Swapping: installed -> .old, new -> installed"
mv "$INSTALLED" "$RETIRED"
mv "$STAGING" "$INSTALLED"
rm -rf "$RETIRED"

echo "7. Checking the result launches"
if "$INSTALLED/Contents/MacOS/BlinkBlink" --version >/dev/null 2>&1; then
    echo "   the swapped bundle ran"
else
    # The app has no --version flag; not launching here says nothing on its own.
    echo "   (could not run it headless; open it by hand if you want to be sure:)"
    echo "   open \"$INSTALLED\""
fi

echo
echo "All four steps completed. This is exactly what the app does to"
echo "/Applications/BlinkBlink.app when it installs an update."
