SecurePath — Test Account Migration

This script uses Firebase Admin SDK. Do not put service-account JSON in source control.

Windows PowerShell example — grant a fake/placeholder CLIENT account test access
(sets emailVerified=true and the securepathTest custom claim):

$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content .\service-account.json -Raw
$env:SECUREPATH_TEST_EMAILS = "daf@securepath.com"
node .\securepath-firebase-migration.js apply-test

Windows PowerShell example — grant an ADMIN account the securepathAdmin custom
claim (required by securepath-admin.html's checkAdmin() AND by the
Firestore Rules' isAdmin() helper — without this claim, the admin panel can
log in but every Firestore read will fail with "Missing or insufficient
permissions"):

$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content .\service-account.json -Raw
$env:SECUREPATH_ADMIN_EMAILS = "admin.islam@securepath.com"
node .\securepath-firebase-migration.js apply-admin

The script only modifies explicitly listed test/admin accounts. It sets:
- apply-test:  emailVerified = true, custom claim securepathTest = true
- apply-admin: custom claim securepathAdmin = true

It does not delete users or Firestore data. This script alone is not enough —
Firestore Security Rules must also grant access based on these claims (see
firestore.rules), otherwise the app still can't read/write any data.

SHA-256: acb0ca2fed715100de9d0147befcf786c1d7745efdac8518e0d68e2c442522a4
