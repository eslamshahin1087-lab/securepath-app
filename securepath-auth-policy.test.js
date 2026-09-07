'use strict';

const assert = require('node:assert/strict');
const {
  normalizeEmail,
  normalizeDomain,
  parseList,
  isExplicitTestEmail,
  isAllowedTestDomain,
  mergeClaimsForTestAccount
} = require('./securepath-auth-policy');

assert.equal(normalizeEmail('  Test@SecurePath.com '), 'test@securepath.com');
assert.equal(normalizeDomain('@SecurePath.com'), 'securepath.com');
assert.deepEqual(parseList('a@example.com, b@example.com ,'), ['a@example.com', 'b@example.com']);
assert.equal(isExplicitTestEmail('test@securepath.com', ['TEST@SECUREPATH.COM']), true);
assert.equal(isExplicitTestEmail('other@securepath.com', ['test@securepath.com']), false);
assert.equal(isAllowedTestDomain('demo@securepath.com', ['securepath.com']), true);
assert.equal(isAllowedTestDomain('demo@other.com', ['securepath.com']), false);
assert.equal(isAllowedTestDomain('securepath.com', ['securepath.com']), false);
assert.deepEqual(
  mergeClaimsForTestAccount({ securepathAdmin: true, custom: 'keep' }),
  { securepathAdmin: true, custom: 'keep', securepathTest: true }
);

console.log('securepath-auth-policy tests: PASS');
