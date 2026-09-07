'use strict';

/**
 * Applies the SecurePath fake-email login policy to wathiqati-app.html.
 *
 * Run from the repository root:
 *   node apply-securepath-auth-fix.js
 *
 * The script creates wathiqati-app.html.pre-auth-fix.bak before changing the
 * file and refuses to modify the file if the expected source block is absent.
 * No Firebase/Firestore data is accessed by this script.
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

const replacement = `var EMAIL_VERIFICATION_REQUIRED = true;\n\n        // ============================================================ //\n        // SECUREPATH TEST / PLACEHOLDER EMAIL POLICY                   //\n        // ------------------------------------------------------------ //\n        // Production customer accounts still require verification.\n        // Placeholder/test accounts may bypass the verification screen\n        // only when their domain is explicitly configured below.\n        // This does NOT bypass Firebase password authentication and does\n        // NOT grant access to another user's Firestore data.\n        // IMPORTANT: use a domain reserved for testing/placeholder data\n        // only; never use a domain shared with real customer addresses.\n        // ============================================================ //\n        var SECUREPATH_TEST_CLAIM = 'securepathTest';\n        var SECUREPATH_TEST_DOMAINS = ['securepath.com'];\n        var SECUREPATH_TEST_ACCOUNT = false;\n\n        function normalizeSecurePathEmail(value) {\n            return String(value || '').trim().toLowerCase();\n        }\n\n        function isSecurePathTestDomainEmail(email) {\n            var value = normalizeSecurePathEmail(email);\n            var at = value.lastIndexOf('@');\n            if (at <= 0 || at === value.length - 1) return false;\n            var domain = value.slice(at + 1);\n            return SECUREPATH_TEST_DOMAINS.indexOf(domain) !== -1;\n        }\n\n        function resolveTestAccount(user) {\n            if (!user) {\n                SECUREPATH_TEST_ACCOUNT = false;\n                return Promise.resolve(false);\n            }\n            return user.getIdTokenResult(true).then(function(tokenResult) {\n                var claims = tokenResult && tokenResult.claims || {};\n                SECUREPATH_TEST_ACCOUNT = claims[SECUREPATH_TEST_CLAIM] === true || isSecurePathTestDomainEmail(user.email);\n                return SECUREPATH_TEST_ACCOUNT;\n            }).catch(function() {\n                SECUREPATH_TEST_ACCOUNT = isSecurePathTestDomainEmail(user.email);\n                return SECUREPATH_TEST_ACCOUNT;\n            });\n        }\n        `;

const next = source.slice(0, start) + replacement + source.slice(end);

if (next === source) {
  throw new Error('No changes were produced. File was not changed.');
}

fs.copyFileSync(file, backup);
const temp = file + '.tmp';
fs.writeFileSync(temp, next, 'utf8');
fs.renameSync(temp, file);

console.log('SecurePath auth fix applied.');
console.log('Backup:', path.basename(backup));
console.log('Allowed placeholder domain: securepath.com');
