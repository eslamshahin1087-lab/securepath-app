SecurePath — Test Account Migration

This script uses Firebase Admin SDK. Do not put service-account JSON in source control.

Windows PowerShell example:

$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content .\service-account.json -Raw
$env:SECUREPATH_TEST_EMAILS = "daf@securepath.com"
node .\securepath-firebase-migration-fixed.js apply-test

The script only modifies explicitly listed test accounts. For apply-test it sets:
- emailVerified = true
- custom claim securepathTest = true

It does not delete users or Firestore data.

SHA-256: acb0ca2fed715100de9d0147befcf786c1d7745efdac8518e0d68e2c442522a4
