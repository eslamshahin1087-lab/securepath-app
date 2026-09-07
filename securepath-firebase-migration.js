#!/usr/bin/env node
'use strict';

/**
 * SecurePath Firebase account migration / test-account manager.
 *
 * SAFETY RULES:
 * - Firestore/customer documents are never deleted or overwritten by this script.
 * - Only Firebase Auth metadata and custom claims are changed.
 * - Default mode is dry-run/list; apply commands require explicit configuration.
 * - An email domain is never treated as proof of ownership. Domain matching is
 *   only an explicit administrative allow-list for non-production/test accounts.
 *
 * Environment:
 *   FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":...}'
 *   SECUREPATH_TEST_EMAILS='test1@example.com,test2@example.com'
 *   SECUREPATH_TEST_UIDS='uid1,uid2'
 *   SECUREPATH_TEST_DOMAINS='securepath.com'
 *   SECUREPATH_ADMIN_EMAILS='admin@example.com'
 *   SECUREPATH_ADMIN_UIDS='uid1,uid2'
 *
 * Commands:
 *   node securepath-firebase-migration.js list
 *   node securepath-firebase-migration.js apply-test
 *   node securepath-firebase-migration.js apply-admin
 *   node securepath-firebase-migration.js apply-both
 *
 * apply-test marks explicitly targeted test accounts as email-verified and adds
 * securepathTest=true. Existing custom claims are preserved.
 * It does NOT touch Firestore customer data.
 */

const admin = require('firebase-admin');
const {
  normalizeEmail,
  normalizeDomain,
  parseList,
  isExplicitTestEmail,
  isAllowedTestDomain,
  mergeClaimsForTestAccount
} = require('./securepath-auth-policy');

function envList(name) {
  return parseList(process.env[name]);
}

function requireServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required.');
  try { return JSON.parse(raw); }
  catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }
}

admin.initializeApp({ credential: admin.credential.cert(requireServiceAccount()) });
const auth = admin.auth();

function isTestTarget(user) {
  const emails = envList('SECUREPATH_TEST_EMAILS').map(normalizeEmail);
  const uids = envList('SECUREPATH_TEST_UIDS');
  const domains = envList('SECUREPATH_TEST_DOMAINS').map(normalizeDomain);
  return uids.includes(user.uid) ||
    isExplicitTestEmail(user.email, emails) ||
    isAllowedTestDomain(user.email, domains);
}

async function resolveTargets(emails, uids, includeDomains) {
  const resolved = [];
  const seen = new Set();

  for (const uid of uids) {
    const user = await auth.getUser(uid);
    if (!seen.has(user.uid)) { resolved.push(user); seen.add(user.uid); }
  }

  for (const email of emails) {
    const user = await auth.getUserByEmail(normalizeEmail(email));
    if (!seen.has(user.uid)) { resolved.push(user); seen.add(user.uid); }
  }

  if (includeDomains) {
    const domains = envList('SECUREPATH_TEST_DOMAINS').map(normalizeDomain);
    if (domains.length) {
      let nextPageToken;
      do {
        const page = await auth.listUsers(1000, nextPageToken);
        for (const user of page.users) {
          if (isAllowedTestDomain(user.email, domains) && !seen.has(user.uid)) {
            resolved.push(user);
            seen.add(user.uid);
          }
        }
        nextPageToken = page.pageToken;
      } while (nextPageToken);
    }
  }

  return resolved;
}

async function listAccounts() {
  const tests = await resolveTargets(
    envList('SECUREPATH_TEST_EMAILS'),
    envList('SECUREPATH_TEST_UIDS'),
    true
  );
  const admins = await resolveTargets(
    envList('SECUREPATH_ADMIN_EMAILS'),
    envList('SECUREPATH_ADMIN_UIDS'),
    false
  );
  console.log(JSON.stringify({
    testAccounts: tests.map(u => ({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      securepathTest: Boolean(u.customClaims && u.customClaims.securepathTest)
    })),
    adminAccounts: admins.map(u => ({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      securepathAdmin: Boolean(u.customClaims && u.customClaims.securepathAdmin)
    }))
  }, null, 2));
}

async function applyClaims(kind) {
  const testUsers = await resolveTargets(
    envList('SECUREPATH_TEST_EMAILS'),
    envList('SECUREPATH_TEST_UIDS'),
    true
  );
  const adminUsers = await resolveTargets(
    envList('SECUREPATH_ADMIN_EMAILS'),
    envList('SECUREPATH_ADMIN_UIDS'),
    false
  );

  const byUid = new Map();
  for (const user of testUsers) {
    byUid.set(user.uid, { user, securepathTest: true });
  }
  for (const user of adminUsers) {
    const item = byUid.get(user.uid) || { user };
    item.securepathAdmin = true;
    byUid.set(user.uid, item);
  }

  if (kind === 'test') {
    for (const [uid, item] of byUid) if (!item.securepathTest) byUid.delete(uid);
  }
  if (kind === 'admin') {
    for (const [uid, item] of byUid) if (!item.securepathAdmin) byUid.delete(uid);
  }

  if (byUid.size === 0) {
    console.log('No explicitly targeted accounts. Nothing changed.');
    return;
  }

  for (const { user, securepathTest, securepathAdmin } of byUid.values()) {
    const existing = user.customClaims || {};
    let next = { ...existing };

    if ((kind === 'test' || kind === 'both') && securepathTest) {
      // This changes only Firebase Auth metadata. It does not touch the client
      // document, policies, documents, points, leads, or any other Firestore data.
      if (!user.emailVerified) await auth.updateUser(user.uid, { emailVerified: true });
      next = mergeClaimsForTestAccount(next);
    }

    if ((kind === 'admin' || kind === 'both') && securepathAdmin) {
      next.securepathAdmin = true;
    }

    await auth.setCustomUserClaims(user.uid, next);
    console.log(`UPDATED ${user.uid} ${user.email || ''} emailVerified=${(kind === 'test' || kind === 'both') && securepathTest ? 'true' : String(user.emailVerified)} claims=${JSON.stringify(next)}`);
  }
}

(async () => {
  const command = process.argv[2] || 'list';
  if (command === 'list') return listAccounts();
  if (command === 'apply-test') return applyClaims('test');
  if (command === 'apply-admin') return applyClaims('admin');
  if (command === 'apply-both') return applyClaims('both');
  throw new Error('Unknown command. Use list, apply-test, apply-admin, or apply-both.');
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
