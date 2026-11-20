# TruthScan integration

New scans can use TruthScan for classification, a saved heatmap, and saved written
analysis. These scans bypass the local classifier, localizer, object detection and
visual-review models. Historical records retain their original results and source.
Provider document IDs stay private and are excluded from browser/mobile responses.

## Classification

| Provider label | Confidence before rounding | App result |
| --- | --- | --- |
| Real | At least 60% | Authentic |
| AI Generated or AI Edited | At least 60% | AI-Generated |
| Real, AI Generated, or AI Edited | Below 60% | Uncertain |
| Digitally Edited or another label | Any valid confidence | Uncertain |

Confidence describes the returned provider label. Separate Authentic/AI-generated
scores were not supplied; they remain null. The raw category and confidence are
retained in the technical record. Provider heatmaps are not named NGIML or
Grad-CAM and receive no invented edited-pixel count.

Policy v2 groups AI Edited under AI-Generated, explicitly explaining that AI
editing does not mean the entire image was generated. Confidence is unchanged.
Saved AI Edited records are updated from their existing provider metadata, with
their previous analysis retained in private analysis_policy_history. This does
not call the provider or consume scan credits. Other historical records remain
under their saved decision rule.

## Start locally

Store TRUTHSCAN_API_KEY in .secrets/truthscan.env, alongside the existing private
Firebase and Cloudinary configuration. From firebase-local, using Node 24:

    node scripts/start-truthscan.mjs

Production sets AUTHENTISCAN_ANALYSIS_PROVIDER=truthscan and the private
TRUTHSCAN_API_KEY in the server environment. Do not place the key in public
Expo/Vite variables or commit it.

From github-team-handoff/mobile, restart Expo for the updated mobile UI:

    npx.cmd expo start --go --lan --clear

Expo Go should use the deployed HTTPS backend and the same Wi-Fi as Metro.
An installed standalone APK needs a new build to include these UI changes.
TypeScript and mocked contracts passed; native-device acceptance remains needed.

## Pending jobs and credits

Refresh queries the saved provider job, without another chargeable submission.
Repeating the same AuthentiScan request ID returns the existing scan. A failed
app scan releases its app allowance; this does not promise a provider refund.
Starting a new scan can incur another provider charge even for an identical image.
PDF export uses saved media and results, without inference or scan-credit usage.

## Verification

Focused adapter/policy/pipeline checks passed, including exact 60% boundaries,
editing categories, ambiguous submission, optional assets, and key handling.
The production web build, mobile typecheck, mobile session/export contracts,
desktop/mobile-width provider UI and PDF layout were checked.
The broader existing UI suite stops at an obsolete 'Your result' heading; it is
not a passing validation for this change. The focused TruthScan UI test passes.

Run no-charge focused checks:

    node --test tests/truthscan.test.mjs tests/truthscan-policy.test.mjs tests/truthscan-pipeline.test.mjs
    node tests/truthscan-ui.mjs

See ../deployment/vps/AWS-STATUS.md for deployment and live-test results.
AWS activation and authenticated live testing completed successfully. One live
test consumed 1,000 provider credits (17,000 to 16,000), returned Uncertain for a
Digitally Edited label, and verified saved heatmap, narrative, PDF, duplicate
request reuse, quota and unauthenticated-access rejection. Temporary test data
was removed. Local-model services use the optional local-models Compose profile;
normal compose startup now selects api and web only.
The pre-integration source is in
../backups/truthscan-preintegration-20261112/firebase-local-source.zip.
Mobile integration commit: 4135384, branch feature/truthscan-20261112.

## AWS rollback

Private source/runtime backup:
 /home/ubuntu/authentiscan-backups/truthscan-20261112T142755Z

Saved images:
 authentiscan-api:before-truthscan-20261112T142755Z
 authentiscan-web:before-truthscan-20261112T142755Z

Restore the backup runtime.env, tag those saved images as authentiscan-api and
authentiscan-web, then run docker compose up -d --no-build --no-deps api web.
Recreate classifier/localizer/visual afterward; they share the API network
namespace. Keep private backup files out of public source control.

The initial concurrent dependency build exhausted the 8 GB server while the
old model workers were loaded. The user rebooted EC2; unused workers were
stopped. Recovery deployment reuses the saved dependency images and copies the
verified build, avoiding another dependency install and runtime version change.
