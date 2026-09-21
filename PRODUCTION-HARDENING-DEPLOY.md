# SecurePath Production Hardening — Deployment

## 1. Deploy trusted backend

From repository root:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

Select the Firebase project used by the web app in the Firebase CLI before deployment.

## 2. Configure Cloudinary signing secret

Never place the Cloudinary API secret in HTML, GitHub, or Firestore:

```bash
firebase functions:secrets:set CLOUDINARY_API_SECRET
firebase deploy --only functions
```

## 3. Data safety

Existing client documents and point balances are not deleted or migrated. After deployment, point balances and point history are server-owned, redemption is transactional, GPS is server-validated, and Cloudinary uploads use server-issued signatures.

## 4. Rollout

1. Deploy Functions.
2. Deploy Firestore Rules.
3. Configure the Cloudinary secret.
4. Test a non-production account.
5. Test document upload and its reward.
6. Test assessment reward.
7. Test GPS trip.
8. Test redemption with 100 points.
9. Verify Admin points history.
10. Publish the updated PWA/APK only after these checks pass.

## 5. Android App Links

The repository contains Digital Asset Links, but a GitHub Pages project path does not by itself provide the Android-required root `/.well-known/assetlinks.json` on the same host. For production App Links, use the final custom SecurePath domain and publish `https://YOUR-DOMAIN/.well-known/assetlinks.json`. The package name and SHA-256 fingerprint must exactly match the signed production APK.
