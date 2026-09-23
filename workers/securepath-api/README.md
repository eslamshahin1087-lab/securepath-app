# SecurePath Free Backend

Cloudflare Worker backend for SecurePath. It replaces Firebase Cloud Functions so the Firebase project can remain on the Spark/free plan.

## Runtime secrets

Set these as Cloudflare Worker Secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete Firebase service-account JSON.
- `CLOUDINARY_API_SECRET`: the Cloudinary API Secret.

Do not put either value in Git.

## Endpoints

- `POST /v1/points` — insurance/habit/manual-driving/GPS point issuance.
- `POST /v1/redeem` — atomic point redemption + lead creation.
- `POST /v1/cloudinary/sign` — server-owned Cloudinary upload parameters and per-user folder/public ID.
- `POST /v1/document/verified` — admin-only verified-document point issuance.
- `POST /v1/client/appointment` — client appointment creation.
- `POST /v1/client/complaint` — client complaint creation + notification + lead.
- `POST /v1/client/renewal` — client renewal request after policy ownership validation.
- `POST /v1/client/advice` — client advice request.
- `POST /v1/client/lead` — validated lead creation for allowed sources.

All requests require a Firebase Authentication ID token in the Authorization header.

The Worker verifies Firebase ID-token signatures, then uses a restricted Firebase service-account identity for Firestore REST writes. Firestore REST requests made with a service-account OAuth token use IAM rather than end-user Firestore Security Rules.

## Deploy

Install Wrangler, then from this directory:

```text
npx wrangler login
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
npx wrangler secret put CLOUDINARY_API_SECRET
npx wrangler deploy
```

After deployment, copy the Worker URL into `js/securepath-backend.js` as `SECUREPATH_API_URL`.

The Workers Free plan currently has daily request and CPU limits, so this backend is intended for a moderate early-stage workload.


## Client write ownership

Sensitive client writes are server-owned. The browser submits a small validated payload plus an idempotency key; the Worker sets the authenticated client ID, timestamps, initial status, and related notification/lead records. Firestore rules therefore no longer expose direct client creation for appointments, complaints, renewals, messages, and leads.

## Cloudinary

Upload signatures are generated only after Firebase ID-token authentication. The Worker assigns the user's Cloudinary folder and a server-generated public ID so the browser cannot choose another user's storage path.
