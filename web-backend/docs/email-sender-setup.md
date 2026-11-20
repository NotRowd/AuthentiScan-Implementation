# Local Gmail sender setup

The setup command stores credentials only and never sends email. The cloud backend
now enforces email verification, with code-entry screens on web and Android.
Restart the backend after setup or changes. Run it as the same Windows user who
saved the sender settings. Emulator mode does not require email verification.

Run in your own PowerShell terminal:

```powershell
cd "D:\AuthentiScan - backend\firebase-local"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\setup-email-sender.ps1"
```

Enter the full team Gmail address and its Google app password at the prompts.
The password prompt is hidden. Never pass secrets as command-line arguments or
paste them into chat. Do not share screenshots containing credentials.

The helper writes `.secrets/email-sender.json`, already excluded by `.gitignore`.
The app password is encrypted with Windows DPAPI for the current Windows user,
and file access is restricted to that user. The address itself is not encrypted.
This is local at-rest protection, not protection against code already running as
your Windows user. The backend must run under this same Windows account.
Do not copy this credential file to another PC or put it in a frontend bundle.

Existing settings are never overwritten. A failed new setup removes only its own
incomplete new file. Generating a credential in Google or saving it here does not
verify SMTP authentication or inbox delivery. Test delivery requires a designated
recipient and an explicit test send; no automatic test message is sent by setup.

## Try the signup flow

1. Stop the existing `start:cloud:mobile` terminal with Ctrl+C and restart it:
   `npm.cmd run start:cloud:mobile`. Leave the classifier running separately.
2. Refresh `http://127.0.0.1:5174`. Create an account with an email you own, or
   sign into an existing unverified account. Existing accounts/history are retained.
3. The verification screen requests a code automatically if no active code or
   resend cooldown exists. Check the recipient inbox and spam folder.
4. Enter the newest six-digit code. Scans and other protected API operations stay
   blocked until verification succeeds. The dashboard opens after confirmation.
5. Android uses the same account, verification record, and backend; reload Metro
   after updating the app. Test on a trusted private network only. Production
   requires HTTPS; never expose this local development backend to the internet.

Any supported email provider can receive the code, not only Gmail. A format check
cannot prove mailbox ownership; a correct code does. Google Sign-In is not added.

## Safety and limits

- Codes expire in 10 minutes and work once. Only the newest code is valid.
- Five wrong guesses lock a challenge. Resend waits 60 seconds; at most three
  sends per account and recipient per hour, and 100 total per UTC day. Failed
  delivery attempts also count. These are application safeguards, not Gmail quotas.
- Codes are HMAC-hashed in Admin-only Firestore documents, not stored as plaintext.
  The backend chooses the recipient from the live Firebase account, never a form
  override. SMTP credentials and provider errors are not returned to clients.
- Verification is recorded in `_emailVerification`, bound to the live account
  email. It does not change Firebase's `emailVerified` flag. A provider-verified
  Firebase account is also accepted. Changing the email invalidates the app record
  for that new email. Profile APIs cannot change email, plan, or verification.
- Rotating the Gmail app password requires a backend restart and invalidates any
  outstanding code hashes; previously verified accounts remain verified.
- `.secrets/email-sender.json` must stay private. Never run the internal
  `read-email-sender.ps1` bridge with `-BackendPipe`: that mode is for the backend
  only. A safe, no-email diagnostic in your own terminal is:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\read-email-sender.ps1" -Check`.
- Gmail is suitable for limited project testing, not a guarantee of production
  delivery or capacity. SMTP acceptance does not guarantee inbox delivery.

## Automated checks

`npm.cmd test` includes isolated Firebase demo-emulator OTP/API tests using a mock
sender. `npm.cmd run test:ui` checks the web verification screen with mocked APIs.
Neither test contacts Gmail, reads the sender credentials, nor sends real messages.
Actual SMTP login and inbox delivery still require a real signup test by the user.

To check the helper without real credentials or network access:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\setup-email-sender.ps1" -SelfTest
```
