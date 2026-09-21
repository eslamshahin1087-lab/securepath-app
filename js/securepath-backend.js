/* SecurePath backend client adapter.
 * The deployed Worker URL is intentionally kept in one place.
 */
(function () {
  'use strict';

  var SECUREPATH_API_URL = 'https://REPLACE-WITH-YOUR-SECUREPATH-API.workers.dev';

  window.SECUREPATH_API_URL = SECUREPATH_API_URL;

  window.securePathApiCall = async function (path, payload) {
    if (!window.firebase || !firebase.auth || !firebase.auth().currentUser) {
      throw new Error('يجب تسجيل الدخول أولاً');
    }

    var user = firebase.auth().currentUser;
    var token = await user.getIdToken();
    var response = await fetch(SECUREPATH_API_URL.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    });

    var data = await response.json().catch(function () {
      return { ok: false, error: 'Invalid backend response' };
    });

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || ('Backend request failed (' + response.status + ')'));
    }

    return data;
  };
})();
