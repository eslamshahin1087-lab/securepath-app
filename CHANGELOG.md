# Changelog

All notable changes to **SecurePath (Wathiqati)** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Signed Cloudinary upload presets (replace unsigned presets).
- Custom domain binding.
- APK checksum verification flow in the PWA.
- Expanded Firestore Security Rules coverage tests.

---

## [1.0.0] - 2026-09-10

### Added
- Initial public release of the SecurePath (Wathiqati) platform.
- Client PWA (`wathiqati-app.html`) with:
  - Email/password authentication with mandatory email verification.
  - Insurance policy tracking (active / near-renewal).
  - Document upload & verification via Cloudinary.
  - Comprehensive protection assessment.
  - InsuraPoints loyalty system with GPS driving telemetry.
  - Point redemption (up to 15% discount).
  - Insurance quote comparison.
  - Referral program (friend invites + quote referrals).
  - Insurer advertisements (managed by admin).
  - Consultation booking and complaint submission.
  - Live broker chat + floating WhatsApp button.
  - Full Arabic (RTL) / English (LTR) localization.
  - Offline support via Service Worker.
- Admin panel (`securepath-admin.html`) with:
  - Client, policy (real-time), product, and offer management.
  - Leads dashboard with source analytics.
  - Appointment and complaint handling.
  - Insurer advertisement management.
- Landing page (`index.html`).
- PWA manifest and service worker.
- Firestore security rules and indexes.
- Firebase migration utility script.
- Digital Asset Links for Android APK verification.
- Android APK distribution via GitHub Releases.

### Security
- Firestore Security Rules deployed and version-controlled.
- Mandatory email verification for non-test accounts.
- Points security migration documented (`POINTS-SECURITY-MIGRATION.md`).
- Firebase service account handled via environment variable.

### Known Issues
- Cloudinary uses unsigned upload presets (scheduled for hardening).
- No custom domain bound yet (uses GitHub Pages default URL).
- APK releases are not tracked inside the repository.
- No CI/CD pipeline configured.

---

[Unreleased]: https://github.com/eslamshahin1087-lab/securepath-app/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/eslamshahin1087-lab/securepath-app/releases/tag/v1.0.0
