#!/usr/bin/env bash
#
# generate-checksums.sh — record the SHA-256 checksum of a published SecurePath
# (Wathiqati) APK release into releases/checksums.txt and releases/releases.json.
#
# Usage:
#   generate-checksums.sh <path-to-apk> <version> <release-url>
#
# Called by .github/workflows/release.yml after a GitHub Release is published.

set -euo pipefail

APK_PATH="${1:?Usage: generate-checksums.sh <apk-path> <version> <release-url>}"
VERSION="${2:?Usage: generate-checksums.sh <apk-path> <version> <release-url>}"
RELEASE_URL="${3:?Usage: generate-checksums.sh <apk-path> <version> <release-url>}"

if [ ! -f "$APK_PATH" ]; then
  echo "generate-checksums.sh: APK file not found: $APK_PATH" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "generate-checksums.sh: jq is required but not installed" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/releases"
mkdir -p "$RELEASES_DIR"

APK_NAME="$(basename "$APK_PATH")"
SHA256="$(sha256sum "$APK_PATH" | awk '{print $1}')"
FILE_SIZE="$(stat -c%s "$APK_PATH" 2>/dev/null || stat -f%z "$APK_PATH")"
DATE_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- checksums.txt: human-readable, append-only log -------------------------
CHECKSUMS_FILE="$RELEASES_DIR/checksums.txt"
touch "$CHECKSUMS_FILE"
echo "${SHA256}  ${APK_NAME}  (v${VERSION}, ${DATE_UTC})" >> "$CHECKSUMS_FILE"

# --- releases.json: machine-readable, consumed by the PWA -------------------
RELEASES_JSON="$RELEASES_DIR/releases.json"
if [ ! -f "$RELEASES_JSON" ]; then
  echo '{"releases": []}' > "$RELEASES_JSON"
fi

TMP_JSON="$(mktemp)"
jq \
  --arg version "$VERSION" \
  --arg filename "$APK_NAME" \
  --arg sha256 "$SHA256" \
  --arg url "$RELEASE_URL" \
  --arg date "$DATE_UTC" \
  --argjson size "$FILE_SIZE" \
  '
  .releases = (
    [.releases[]? | select(.version != $version)]
    + [{
        version: $version,
        filename: $filename,
        sha256: $sha256,
        size_bytes: $size,
        url: $url,
        published_at: $date
      }]
  ) |
  .latest = $version
  ' "$RELEASES_JSON" > "$TMP_JSON"
mv "$TMP_JSON" "$RELEASES_JSON"

echo "generate-checksums.sh: recorded checksum for v${VERSION}: ${SHA256}"
