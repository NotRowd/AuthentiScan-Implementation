# PayMongo test checkout — AuthentiScan

## Current scope

Web hosted checkout for GCash, Maya (`paymaya`) and cards. Pro has unlimited scans
for one calendar month, with end-of-month clamping in Philippine time. No model
or manuscript changes. The approved introductory price is **PHP 199 (19900 centavos)**,
with **manual renewal**: one payment buys one calendar month and never triggers an
automatic charge. After expiry, the account returns to Free unless another pass
is purchased. Automatic recurring billing is not implemented.

This build cannot accept live API keys or enable live billing. It does not collect
card numbers, wallet credentials, or full provider billing payloads. Nothing has
been connected to a real merchant or charged during implementation.

## Before trying hosted checkout

1. The approved offer is **PHP 199 for a one-time monthly pass with unlimited scans**.
   Server defaults and the env template reflect these terms; checkout still requires
   test credentials and an allowlisted test account.
2. Create/verify the PayMongo merchant account and enable its test methods. The
   provider's account requirements and enabled methods control what is available.
3. Create a dedicated AuthentiScan test account. Obtain its Firebase UID from your
   administration console. Do not use an ordinary customer's account.
4. A local `.secrets/payments.test.env` has been prepared with the approved terms
   and blank credentials. Fill the test secret key, test webhook signing secret,
   and test-user UID locally. For a fresh installation, copy `payments.test.env.example`
   first; do not overwrite an existing credential file. Keep actual secrets out of chat and Git.
   The `.secrets` directory is already ignored. Do not use any `VITE_` secret variable.
5. Stop the previous backend normally (Ctrl+C), then run from `firebase-local`:

   ```powershell
   npm.cmd run start:cloud:payments:test
   ```

   Keep the classifier running normally. This uses the existing mobile-compatible
   API launcher, not a separate database. Do not run two backend sessions.
6. Start the webhook-only gateway in a separate terminal:

   ```powershell
   npm.cmd run start:payment-webhook
   ```

7. Use your chosen HTTPS tunnel to forward **only port 5006**. Configure the
   PayMongo TEST webhook URL as:
   `https://YOUR-TUNNEL/api/payments/paymongo/webhook`
   Subscribe to `checkout_session.payment.paid`. Put this endpoint's test signing
   secret in the env file and restart the backend if it changes. The gateway only
   forwards that POST path; it does not expose account, media or scan routes.
   Never tunnel ports 5001–5005, 5174 or the Firebase emulators for this purpose.
8. Sign in as the designated test user on the local web app. Open Subscription,
   confirm the test-purchase checkbox, and open hosted checkout. Use provider test
   instruments only. After returning, use **Check payment** if confirmation has
   not arrived. The browser return URL never activates access.

No tunnel is installed or opened by this change. Merchant setup, real test keys,
and the external hosted-checkout exercise must still be completed by the owner.

## Safety and persistence

- Billing is disabled with missing configuration. Non-allowlisted users cannot buy
  test access. Test benefits apply only while billing mode is `test` and the UID
  remains allowlisted. Turning it off immediately restores Free enforcement.
- The original `plan` field is not overwritten. A separate `billing_test` record
  stores expiry. This is deliberately not a live subscription.
- Amount, currency, duration and methods come from the backend. Browser-supplied
  price/owner/plan fields are rejected.
- One pending order per account; duplicate clicks resume it. A creation timeout
  retries the same stored order and provider idempotency key. If preparation stays
  unresolved, inspect the merchant's test dashboard rather than creating manual
  duplicate orders. Active test Pro cannot buy another pass until expiry.
- Webhooks use raw-body HMAC SHA-256 over `timestamp.body`, test signature `te`,
  constant-time comparison, and a five-minute timestamp window. The backend then
  retrieves the Checkout Session with its own test merchant key and checks the
  saved reference, session ID, metadata, paid amount, currency and method.
- Payment IDs and order settlement are transactional. Duplicate deliveries or
  simultaneous refreshes do not grant another month. Transient processing errors
  return non-2xx so provider retries remain possible. Manual status verification
  offers recovery when a PC/tunnel was offline.
- Paid and expired orders are mirrored atomically to owner-scoped history. All
  collections remain server-only under the existing deny-direct-access rules.
- Failed/abandoned checkout does not grant access. A failed payment attempt can
  be retried in the same checkout. A browser cancellation is not proof that a
  payment failed. Expired sessions are confirmed through the provider before a
  replacement is created.
- Scan usage keeps counting during unlimited access; failures refund their own
  day's reservation. Expiry returns to the normal daily allowance, not a new grant
  of five scans. History and existing analyses remain unchanged.

## Remaining before any live release

Actual PayMongo sandbox verification for every enabled method,
merchant approval, public HTTPS hosting, monitoring/rate limits,
refund and dispute lifecycle handling, support procedures, and a separate reviewed
live-mode implementation. Refunds/disputes are not processed by this test-only
version. Do not remove the live-mode guard to take real payments.

The backend allowance is shared by web/native clients. Native Android checkout
and its subscription screens are not changed here; Play distribution and billing
requirements must be resolved before adding in-app purchasing.

## Verification

Implementation checks on 16 October 2026: all 69 backend/emulator tests passed,
including the five payment unit tests and four payment integration scenarios.
Browser regressions and the production web build passed. The existing AI lock
verified unchanged. These are local/fixture checks, not a completed PayMongo
sandbox transaction; a merchant-connected test is still required.

- `npm.cmd run test:billing`: signatures, month boundaries, provider request shape,
  disabled/live configuration, URL validation and webhook gateway isolation.
- `npm.cmd test`: isolated Firebase integration coverage, including paid access,
  wrong amount/mode/reference, retries, duplicate delivery and expiry. All payment
  provider responses are fixtures; these tests do not contact PayMongo.
- `npm.cmd run test:ui`: mocked subscription/consent/return/retry and narrow layouts.
- `npm.cmd run build` and `npm.cmd run verify:ai-lock`.

## Official references checked 16 October 2026

- [Hosted checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout)
- [Quick start](https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start)
- [Webhook signature format](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)
- [Event envelopes](https://docs.paymongo.com/docs/developer-tools-webhooks-events)
- [Retrieve a Checkout Session](https://docs.paymongo.com/re/reference/get_checkout_sessions)
- [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)

Provider guides currently show both legacy event objects and the newer direct
envelope; both are accepted only after signature and test-mode verification.
