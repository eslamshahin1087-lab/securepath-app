'use strict';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^@/, '');
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map(function (item) { return item.trim(); })
    .filter(Boolean);
}

function normalizeAllowList(items) {
  return (Array.isArray(items) ? items : []).map(normalizeEmail).filter(Boolean);
}

function normalizeDomainAllowList(items) {
  return (Array.isArray(items) ? items : []).map(normalizeDomain).filter(Boolean);
}

function isExplicitTestEmail(email, allowList) {
  var normalized = normalizeEmail(email);
  return normalized !== '' && normalizeAllowList(allowList).indexOf(normalized) !== -1;
}

function isAllowedTestDomain(email, domainAllowList) {
  var normalizedEmail = normalizeEmail(email);
  var at = normalizedEmail.lastIndexOf('@');
  if (at <= 0 || at === normalizedEmail.length - 1) return false;
  var domain = normalizedEmail.slice(at + 1);
  return normalizeDomainAllowList(domainAllowList).indexOf(domain) !== -1;
}

function mergeClaimsForTestAccount(existingClaims) {
  return Object.assign({}, existingClaims || {}, { securepathTest: true });
}

module.exports = {
  normalizeEmail: normalizeEmail,
  normalizeDomain: normalizeDomain,
  parseList: parseList,
  isExplicitTestEmail: isExplicitTestEmail,
  isAllowedTestDomain: isAllowedTestDomain,
  mergeClaimsForTestAccount: mergeClaimsForTestAccount
};
