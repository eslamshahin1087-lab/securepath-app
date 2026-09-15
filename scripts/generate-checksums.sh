#!/usr/bin/env bash
# scripts/generate-checksums.sh
#
# Called by .github/workflows/release.yml after a GitHub Release is
# published with an APK asset attached. Computes the SHA-256 checksum
# of the APK and records it in releases/checksums.txt (append, human
# readable) and releases/releases.json (structured, machine readable —
# meant to eventually be read by the PWA to show/verify the current
# version, per releases/README.md).
#
# Usage: ./scripts/generate-checksums.sh <path-to-apk> <version> <release-url>
#   version:     tag name without a leading "v" (e.g. "1.2.0")
#   release-url: the GitHub Release page URL

set -euo pipefail

APK_PATH="${1:?Usage: $0 <path-to-apk> <version> <release-url>}"
VERSION="${2:?Usage: $0 <path-to-apk> <version> <release-url>}"
RELEASE_URL="${3:?Usage: $0 <path-to-apk> <version> <release-url>}"

if [ ! -f "$APK_PATH" ]; then
  echo "generate-checksums.sh: APK not found at '$APK_PATH'" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASES_DIR="$REPO_ROOT/releases"
mkdir -p "$RELEASES_DIR"

APK_NAME="$(basename "$APK_PATH")"
SHA256="$(sha256sum "$APK_PATH" | awk '{print $1}')"
SIZE_BYTES="$(stat -c%s "$APK_PATH" 2>/dev/null || stat -f%z "$APK_PATH")"
DATE_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

CHECKSUMS_FILE="$RELEASES_DIR/checksums.txt"
{
  echo "# SecurePath (Wathiqati) — APK checksums"
  echo "# version | sha256 | file | date (UTC) | release url"
} > /tmp/checksums_header.txt
if [ ! -f "$CHECKSUMS_FILE" ]; then
  cat /tmp/checksums_header.txt > "$CHECKSUMS_FILE"
fi
echo "${VERSION} | ${SHA256} | ${APK_NAME} | ${DATE_UTC} | ${RELEASE_URL}" >> "$CHECKSUMS_FILE"

RELEASES_JSON="$RELEASES_DIR/releases.json"
if [ ! -f "$RELEASES_JSON" ]; then
  echo "[]" > "$RELEASES_JSON"
fi

NEW_ENTRY=$(cat <<EOF
{
  "version": "${VERSION}",
  "file": "${APK_NAME}",
  "sha256": "${SHA256}",
  "sizeBytes": ${SIZE_BYTES},
  "publishedAt": "${DATE_UTC}",
  "releaseUrl": "${RELEASE_URL}"
}
EOF
)

TMP_JSON="$(mktemp)"
if command -v jq >/dev/null 2>&1; then
  jq --argjson entry "$NEW_ENTRY" \
     '[$entry] + [.[] | select(.version != $entry.version)]' \
     "$RELEASES_JSON" > "$TMP_JSON"
  mv "$TMP_JSON" "$RELEASES_JSON"
else
  echo "generate-checksums.sh: jq not found, skipping releases.json update" >&2
fi

echo "Checksum recorded for ${APK_NAME} (v${VERSION}): ${SHA256}"
