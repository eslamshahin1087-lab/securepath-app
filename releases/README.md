# SecurePath — Releases

This directory tracks every published APK release of SecurePath (Wathiqati).

## How releases work

1. A new APK is built externally (PWABuilder / Bubblewrap).
2. The APK is uploaded to a **GitHub Release** (not committed to the repo).
3. A CI workflow (`.github/workflows/release.yml`) automatically:
   - Downloads the APK from the release asset.
   - Computes its SHA-256 checksum.
   - Writes `checksums.txt` and `releases.json`.
4. The PWA reads `releases.json` to display the current version and
   checksum to the user, allowing them to verify the APK before install.

## Verify an APK manually

**Linux / macOS:**
