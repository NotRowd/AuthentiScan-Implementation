import {environment,checkPorts,child,firebaseCLI} from './runtime.mjs';
try {
  // API tests listen on random ports, so they can safely run beside the live web.
  const env=environment();await checkPorts({includeApp:false});
  // Ephemeral test session: never imports, clears, or exports manual test data.
  const p=child(firebaseCLI,['emulators:exec','--project','demo-authentiscan-local','--only','auth,firestore,storage','node --test tests/upload-review.test.mjs tests/email-verification.test.mjs tests/current-ai-release.test.mjs tests/guard.test.mjs tests/cloud-mode.test.mjs tests/cloudinary-media.test.mjs tests/ai-contract.test.mjs tests/object-detection.test.mjs tests/localization.test.mjs tests/scene.test.mjs tests/feature-review.test.mjs tests/report-images.test.mjs tests/billing.test.mjs tests/billing-integration.test.mjs tests/integration.test.mjs tests/web.test.mjs'],env);
  p.on('exit',code=>{process.exitCode=code??1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>p.kill('SIGINT'));
}catch(e){console.error(e.message);process.exitCode=1;}
