#!/usr/bin/env node
'use strict';

/**
 * SecurePath account migration / test-account manager.
 *
 * SAFETY RULES:
 * - Never trusts an email domain as proof of ownership.
 * - Only explicitly listed emails/UIDs are modified.
 * - The `list` command is read-only; apply commands mutate only targeted Auth users.
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
 *   node securepath-firebase-migration.js list
 *   node securepath-firebase-migration.js apply-test
 *   node securepath-firebase-migration.js apply-admin
 *   node securepath-firebase-migration.js apply-both
 *
 * Apply commands set custom claims only for the explicit accounts above.
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
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
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
  const tests = await resolveTargets(
    envList('SECUREPATH_TEST_EMAILS'),
    envList('SECUREPATH_TEST_UIDS')
  );

  const admins = await resolveTargets(
    envList('SECUREPATH_ADMIN_EMAILS'),
    envList('SECUREPATH_ADMIN_UIDS')
  );

  console.log(JSON.stringify({
    testAccounts: tests.map(u => ({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified
    })),
    adminAccounts: admins.map(u => ({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified
    }))
  }, null, 2));
}

async function applyClaims(kind) {
  const testUsers = await resolveTargets(
    envList('SECUREPATH_TEST_EMAILS'),
    envList('SECUREPATH_TEST_UIDS')
  );

  const adminUsers = await resolveTargets(
    envList('SECUREPATH_ADMIN_EMAILS'),
    envList('SECUREPATH_ADMIN_UIDS')
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
    for (const [uid, item] of byUid) {
      if (!item.securepathTest) byUid.delete(uid);
    }
  }

  if (kind === 'admin') {
    for (const [uid, item] of byUid) {
      if (!item.securepathAdmin) byUid.delete(uid);
    }
  }

  for (const { user, securepathTest, securepathAdmin } of byUid.values()) {
    const existing = user.customClaims || {};
    const next = { ...existing };

    if ((kind === 'test' || kind === 'both') && securepathTest) {
      await auth.updateUser(user.uid, { emailVerified: true });
      next.securepathTest = true;
    }

    if ((kind === 'admin' || kind === 'both') && securepathAdmin) {
      next.securepathAdmin = true;
    }

    await auth.setCustomUserClaims(user.uid, next);

    console.log(
      `UPDATED ${user.uid} ${user.email || ''} ` +
      `emailVerified=${(kind === 'test' || kind === 'both') && securepathTest ? 'true' : String(user.emailVerified)} ` +
      `claims=${JSON.stringify(next)}`
    );
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
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
