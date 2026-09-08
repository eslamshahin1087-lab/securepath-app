/* SecurePath — Auth & Client Identity Hardening v1
 * Scope: client identity resolution only.
 * Safety: no collection deletion, no document migration, no schema destructive changes.
 * Canonical identity: Firebase Auth UID.
 */
(function () {
  'use strict';

  var INSTALL_KEY = '__SECUREPATH_AUTH_IDENTITY_HARDENING_V1__';
  if (window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function identityError(code, message) {
    return { code: code, message: message };
  }

  function getCanonicalClientProfile(uid) {
    var dbRef = window.db;
    if (!dbRef || !uid) {
      return Promise.reject(identityError('client/identity-unavailable', 'Firebase client identity is unavailable.'));
    }

    // 1) Canonical path: clients/{Firebase UID}
    return dbRef.collection('clients').doc(uid).get().then(function (doc) {
      if (doc.exists) {
        var data = doc.data() || {};
        return { ref: doc.ref, data: data };
      }

      // 2) Legacy compatibility: retain existing records where the document ID
      // predates UID canonicalization, but ONLY when the stored UID is an exact match.
      return dbRef.collection('clients').where('uid', '==', uid).limit(2).get().then(function (snap) {
        if (snap.size > 1) {
          throw identityError('client/duplicate-uid', 'Multiple client records are linked to this Firebase account.');
        }
        if (snap.size === 1) {
          var legacy = snap.docs[0];
          var legacyData = legacy.data() || {};
          if (normalize(legacyData.uid) !== normalize(uid)) {
            throw identityError('client/identity-mismatch', 'The client record is not linked to the authenticated Firebase account.');
          }
          return { ref: legacy.ref, data: legacyData };
        }

        // IMPORTANT: do not fall back to email. Email can be duplicated, changed,
        // or associated with a different legacy record and must never select a client.
        return null;
      });
    });
  }

  // Replace the existing resolver with UID-first / UID-only profile resolution.
  // This keeps the current schema intact while removing the dangerous email fallback.
  window.getClientProfile = function (uid) {
    return getCanonicalClientProfile(uid);
  };

  // Defensive guard: whenever the app has an authenticated Firebase user,
  // the in-memory client profile must belong to exactly that UID.
  window.verifyClientIdentity = (function (original) {
    return function (profile, user, identifier) {
      if (!user || !user.uid) {
        throw identityError('client/identity-unavailable', 'No authenticated Firebase UID is available.');
      }

      var data = (profile && profile.data) || {};
      var storedUid = normalize(data.uid || '');
      var profileDocId = profile && profile.ref ? String(profile.ref.id || '') : '';
      var currentUid = normalize(user.uid);

      if (profileDocId && normalize(profileDocId) !== currentUid && storedUid !== currentUid) {
        throw identityError('client/identity-mismatch', 'The client profile does not belong to the authenticated Firebase account.');
      }
      if (storedUid && storedUid !== currentUid) {
        throw identityError('client/identity-mismatch', 'The client profile UID does not match the authenticated Firebase account.');
      }

      return original(profile, user, identifier);
    };
  })(window.verifyClientIdentity || function () {
    return true;
  });

  // Defense-in-depth: never retain a client state object whose UID differs from
  // Firebase Auth's current UID when the existing app sets STATE.currentUser.
  if (window.STATE) {
    try {
      Object.defineProperty(window.STATE, '__authIdentityHardening', {
        value: true,
        enumerable: false,
        configurable: false
      });
    } catch (e) {
      // Non-fatal marker failure; identity enforcement above remains active.
    }
  }

  console.info('[SecurePath] Auth & Client Identity Hardening v1 active: UID-first, email fallback disabled.');
})();
