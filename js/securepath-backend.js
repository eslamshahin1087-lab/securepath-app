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

    async function send(forceRefresh) {
      var token = await user.getIdToken(!!forceRefresh);
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

      return { response: response, data: data };
    }

    var result = await send(false);

    // Refresh the Firebase ID token once if the Worker rejects an expired token.
    if (result.response.status === 401) {
      result = await send(true);
    }

    if (!result.response.ok || result.data.ok === false) {
      throw new Error(result.data.error || ('Backend request failed (' + result.response.status + ')'));
    }

    return result.data;
  };
})();
