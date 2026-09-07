'use strict';

/**
 * Applies the SecurePath fake-email authentication policy to wathiqati-app.html.
 *
 * SECURITY MODEL:
 * - Production customers still require email verification.
 * - Placeholder/test accounts bypass verification only when Firebase Admin
 *   has explicitly granted the `securepathTest=true` custom claim.
 * - The browser never treats @securepath.com itself as proof of eligibility.
 * - A backup is created before changing the file.
 * - No Firebase/Firestore data is accessed by this script.
 */

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'wathiqati-app.html');
const backup = path.join(__dirname, 'wathiqati-app.html.pre-auth-fix.bak');

const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('var EMAIL_VERIFICATION_REQUIRED = true;');
const endMarker = 'var CLOUDINARY_CLOUD_NAME =';
const end = source.indexOf(endMarker, start);

if (start < 0 || end < 0 || end <= start) {
  throw new Error('Expected authentication policy block was not found. File was not changed.');
}

const replacement = `var EMAIL_VERIFICATION_REQUIRED = true;\n\n        // ============================================================ //\n        // SECUREPATH TEST / PLACEHOLDER EMAIL POLICY                   //\n        // ------------------------------------------------------------ //\n        // Production customer accounts still require email verification.\n        // Explicitly provisioned test/placeholder accounts may bypass\n        // the verification screen only when Firebase Admin has granted\n        // the securepathTest=true custom claim to that exact account.\n        // Do NOT infer this from an email domain in the browser: this is\n        // public client code and domain-only bypass would let anyone\n        // register a fake address and enter the protected application.\n        // ============================================================ //\n        var SECUREPATH_TEST_CLAIM = 'securepathTest';\n        var SECUREPATH_TEST_ACCOUNT = false;\n\n        function resolveTestAccount(user) {\n            if (!user) {\n                SECUREPATH_TEST_ACCOUNT = false;\n                return Promise.resolve(false);\n            }\n            return user.getIdTokenResult(true).then(function(tokenResult) {\n                var claims = tokenResult && tokenResult.claims || {};\n                SECUREPATH_TEST_ACCOUNT = claims[SECUREPATH_TEST_CLAIM] === true;\n                return SECUREPATH_TEST_ACCOUNT;\n            }).catch(function() {\n                SECUREPATH_TEST_ACCOUNT = false;\n                return false;\n            });\n        }\n        `;

const next = source.slice(0, start) + replacement + source.slice(end);

if (next === source) {
  throw new Error('No changes were produced. File was not changed.');
}

if (fs.existsSync(backup)) {
  throw new Error('Backup already exists. Refusing to overwrite it. Review the existing backup before retrying.');
}

fs.copyFileSync(file, backup);
const temp = file + '.tmp';
fs.writeFileSync(temp, next, 'utf8');
fs.renameSync(temp, file);

console.log('SecurePath authentication policy hardened.');
console.log('Backup:', path.basename(backup));
console.log('Test-account eligibility: explicit Firebase claim securepathTest=true only.');
