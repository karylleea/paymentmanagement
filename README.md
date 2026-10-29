# Resort GCash Payments

A small standalone payment-management app for the Resort Booking project. It contains GCash payment setup and booking payment verification only; the original resort booking app is unchanged.

## Run locally

```powershell
npm install
npm run dev
```

Open http://localhost:3000. If that port is in use, run `npm run dev -- --port 3001` instead.

The app uses the Firebase project configuration from the original application by default. To point it at another Firebase web app, copy `.env.example` to `.env.local` and fill in the Firebase web app values.

Sign in with the Google account whose Firebase UID owns the resort. Firestore records are shared with the main app:

- Payment settings: `resortOwners/{ownerUid}/site/payment`
- Booking/payment records: `guestbooking` filtered by `ownerUid`

The payment manager displays guest-submitted `proofOfPaymentUrl` images. Verifying a payment sets `paymentStatus` to `paid`, records `paidAmount` and `paidAt`, and changes booking `status` to `Approved`, matching the existing manual payment workflow.

Deploying this as a separate app requires using the same Firebase project and configuring Google sign-in and Firestore rules for the payment operations. No PayMongo integration is included.