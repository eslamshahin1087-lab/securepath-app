# SecurePath Production Architecture

## Canonical identity model

- Firebase Authentication UID is the only canonical user identity.
- Client profile document path: `clients/{uid}`
- Every client-owned record uses `clientId: uid`.
- Firestore document IDs are not reused as an alternative identity unless explicitly documented.

## Collections

### Client-owned
- clients
- policies
- documents
- claims
- appointments
- complaints
- messages
- notifications
- pointsLog
- insuranceAssessments
- payments

### Broker/admin-owned
- products
- companies
- insuranceTypes
- offers
- companyAds
- brokerSettings
- activity
- admin

### Controlled conversion funnel
- leads

## Security model

The client UI must never be treated as the authorization boundary. Authorization is enforced by Firestore Security Rules and Firebase Admin custom claims.

The `securepathAdmin` custom claim is the preferred production mechanism. The `admin/{uid}` document exists only as a backwards-compatible fallback for legacy accounts.

## Deployment

Deploy Firestore configuration:

```bash
firebase deploy --only firestore
```

Deploy Hosting:

```bash
firebase deploy --only hosting
```

## Important production note

The current client application contains legacy browser-side point and assessment workflows. Before deploying the new strict rules, move privileged point issuance/redemption and assessment finalization to a trusted backend or Firebase Admin/Cloud Functions path.

Do not loosen Firestore rules to compensate for client-side authorization errors.
