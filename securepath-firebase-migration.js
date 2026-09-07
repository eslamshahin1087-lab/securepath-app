#!/usr/bin/env node
'use strict';

/**
 * SecurePath account migration / test-account manager.
 *
 * SAFETY RULE:
 * - Never trusts a domain as proof of ownership.
 * - Only explicitly listed emails/UIDs are modified.
 * - Default mode is dry-run.
 * - Uses Firebase Admin SDK (server-side only).
 *
 * Environment:
 *   FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":...}'
 *   SECUREPATH_TEST_EMAILS='test1@example.com,test2@example.com'
 *   SECUREPATH_TEST_UIDS='uid1,uid2'
 *   SECUREPATH_ADMIN_EMAILS='admin@example.com'
 *   SECUREPATH_ADMIN_UIDS='uid1,uid2'
 *
 * Commands:
 *   node securepath-firebase-migration-fixed.js list
 *   node securepath-firebase-migration-fixed.js apply-test
 *   node securepath-firebase-migration-fixed.js apply-admin
 *   node securepath-firebase-migration-fixed.js apply-both
 *
 * apply commands set custom claims only for the explicit accounts above.
 * They do NOT delete users or Firestore data.
 */

const admin = require('firebase-admin');

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function requireServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required.');
  try { return JSON.parse(raw); }
  catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }
}

admin.initializeApp({ credential: admin.credential.cert(requireServiceAccount()) });
const auth = admin.auth();

async function resolveTargets(emails, uids) {
  const resolved = [];
  for (const uid of uids) {
    const user = await auth.getUser(uid);
    resolved.push(user);
  }
  for (const email of emails) {
    const user = await auth.getUserByEmail(email);
    if (!resolved.some(x => x.uid === user.uid)) resolved.push(user);
  }
  return resolved;
}

async function listAccounts() {
  const tests = await resolveTargets(envList('SECUREPATH_TEST_EMAILS'), envList('SECUREPATH_TEST_UIDS'));
  const admins = await resolveTargets(envList('SECUREPATH_ADMIN_EMAILS'), envList('SECUREPATH_ADMIN_UIDS'));
  console.log(JSON.stringify({
    testAccounts: tests.map(u => ({ uid: u.uid, email: u.email, emailVerified: u.emailVerified })),
    adminAccounts: admins.map(u => ({ uid: u.uid, email: u.email, emailVerified: u.emailVerified }))
  }, null, 2));
}

async function applyClaims(kind) {
  const testUsers = await resolveTargets(envList('SECUREPATH_TEST_EMAILS'), envList('SECUREPATH_TEST_UIDS'));
  const adminUsers = await resolveTargets(envList('SECUREPATH_ADMIN_EMAILS'), envList('SECUREPATH_ADMIN_UIDS'));
  const byUid = new Map();
  for (const u of testUsers) byUid.set(u.uid, { user: u, securepathTest: true });
  for (const u of adminUsers) {
    const x = byUid.get(u.uid) || { user: u };
    x.securepathAdmin = true;
    byUid.set(u.uid, x);
  }

  if (kind === 'test') {
    for (const [uid, item] of byUid) if (!item.securepathTest) byUid.delete(uid);
  }
  if (kind === 'admin') {
    for (const [uid, item] of byUid) if (!item.securepathAdmin) byUid.delete(uid);
  }

  for (const { user, securepathTest, securepathAdmin } of byUid.values()) {
    const existing = user.customClaims || {};
    const next = { ...existing };

    // A SecurePath test account is an explicitly targeted, non-production
    // account. Mark it verified so the client does not require a real
    // verification email/code for this account. Never infer this from the
    // email domain alone; only users selected by the explicit allow-list
    // above reach this branch.
    if ((kind === 'test' || kind === 'both') && securepathTest) {
      await auth.updateUser(user.uid, { emailVerified: true });
      next.securepathTest = true;
    }

    if ((kind === 'admin' || kind === 'both') && securepathAdmin) {
      next.securepathAdmin = true;
    }

    await auth.setCustomUserClaims(user.uid, next);
    console.log(`UPDATED ${user.uid} ${user.email || ''} emailVerified=${(kind === 'test' || kind === 'both') && securepathTest ? 'true' : String(user.emailVerified)} claims=${JSON.stringify(next)}`);
  }

  if (byUid.size === 0) {
    console.log('No explicitly targeted accounts. Nothing changed.');
  }
}

(async () => {
  const command = process.argv[2] || 'list';
  if (command === 'list') return listAccounts();
  if (command === 'apply-test') return applyClaims('test');
  if (command === 'apply-admin') return applyClaims('admin');
  if (command === 'apply-both') return applyClaims('both');
  throw new Error('Unknown command. Use list, apply-test, apply-admin, or apply-both.');
})().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
