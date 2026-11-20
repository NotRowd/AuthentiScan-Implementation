# Subscription page usability — November 4, 2026

The subscription page now leads with the user's current plan, scan allowance,
and an action to scan or view remaining scans. Active test Pro displays its full
expiry date and Philippine time, explains manual renewal and the return to Free,
and keeps purchase controls hidden while active.

Free and Pro cards show price, allowance and included features consistently.
The test-mode notice remains prominent. Pending orders offer a resume action.
When PayMongo returns the user to the app, AuthentiScan automatically checks
the user's server-owned pending order, refreshes the account plan, and retries
briefly if confirmation is delayed. A return URL alone never grants Pro. The
page explains that it is checking and warns the user not to pay again; the
manual Check payment action remains available if the automatic check times out.
A cancelled checkout does not start repeated checks. Payment history uses
distinct pending/confirmed/expired badges and readable dates. Loading does not
present an assumed Free plan or empty history as loaded account data.

Price remains PHP 199 for one calendar month with manual renewal. This change
does not enable live billing, change payment verification or alter scan results.

Validation: production build passed after automatic return confirmation was
added. The browser regression suite was not rerun for this change. Earlier UI
work used isolated mocks and screenshots; those checks do not test PayMongo
delivery or charge real payments.

The user supplied screenshots of a successful PayMongo GCash test payment and
Pro activation earlier today. Whether that activation used webhook delivery or
the manual Check payment fallback is still unverified; inspect PayMongo Event
Deliveries for the corresponding HTTP 200 response. Automatic return checking
uses the existing authenticated server refresh route, independent of webhook
delivery. No new merchant-connected transaction was performed for this change.
