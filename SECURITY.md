# SecurePath Security Policy

## Scope

This repository contains the SecurePath web client, broker/admin interface, PWA assets, Firebase deployment configuration and Firebase Admin migration utility.

## Production security rules

1. Firebase Authentication is the identity provider.
2. The Firebase Auth UID is the canonical user identifier.
3. Client profile records belong under `clients/{uid}`.
4. Child records must use `clientId` equal to that UID.
5. `securepathAdmin=true` is the preferred broker/admin authorization claim.
6. Client-side checks are UX checks only; Firestore Rules are the authorization boundary.
7. Firebase Admin service-account credentials must never be committed.
8. Sensitive rewards, financial entitlements and administrative mutations should be performed by trusted server-side code.
9. Cloudinary upload presets for customer documents must be restricted and monitored; public distribution URLs must not be treated as authorization.
10. Production Firestore Rules must be deployed from the repository and reviewed against the exact client write paths before activation.

## Reporting a security issue

Do not publish credentials, customer records or exploitable details in a public issue. Report the issue privately to the repository owner with reproduction steps and impact information.
