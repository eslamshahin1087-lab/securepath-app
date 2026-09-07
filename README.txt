SecurePath — Firebase Account Migration

This utility uses Firebase Admin SDK. Never commit service-account JSON.

Windows PowerShell:

$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content .\service-account.json -Raw
$env:SECUREPATH_TEST_EMAILS = "test@example.com"
node .\securepath-firebase-migration.js apply-test

Available commands:

npm run list
npm run apply-test
npm run apply-admin
npm run apply-both

The utility only modifies explicitly configured accounts and does not delete Firebase Auth users or Firestore data.

Security note:
- Production admin access should use the securepathAdmin Firebase custom claim.
- Do not rely on client-side checks as an authorization boundary.
- Review and deploy firestore.rules before production hardening.
