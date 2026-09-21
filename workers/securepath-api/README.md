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
- `POST /v1/cloudinary/sign` — signed Cloudinary upload parameters.
- `POST /v1/document/verified` — admin-only verified-document point issuance.

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
