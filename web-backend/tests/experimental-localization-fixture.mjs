import {localizationFixture} from './localization-fixture.mjs';
import {EXPERIMENTAL_LOCALIZER_MODEL,EXPERIMENTAL_HEAD_SHA} from '../shared/localization-contract.mjs';
export function experimentalFixture(hash){
  return {...localizationFixture(hash),model_version:EXPERIMENTAL_LOCALIZER_MODEL,model_sha256:EXPERIMENTAL_HEAD_SHA,
    threshold:.97,usage_mode:'experimental',validation_status:'failed',release_approved:false};
}
