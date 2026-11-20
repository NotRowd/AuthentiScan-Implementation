import {createTruthScanClient} from './truthscan.mjs';
import {mapTruthScanClassification} from '../shared/truthscan-policy.mjs';
import {randomUUID} from 'node:crypto';

export const usesTruthScan = () => process.env.AUTHENTISCAN_ANALYSIS_PROVIDER === 'truthscan';
export const truthScanClient = () => createTruthScanClient({apiKey: process.env.TRUTHSCAN_API_KEY});

// Resume only queries the durable job; it never submits another paid detection.
export async function runTruthScanPipeline({record, ref, media, finish, bytes,
  client = truthScanClient(), submit = false, timeoutMs = 90000}) {
  let job = record.provider_job;
  if (submit) {
    if (job) throw new Error('A provider job already exists for this scan. Resume it.');
    await client.submit(bytes, {id: randomUUID(), saveJob: async value => {
      job = value;
      await ref.update({provider_job: value});
    }});
  }
  if (!job?.job_id) throw new Error('No saved TruthScan job is available.');
  const response = await client.poll(job.job_id, {timeoutMs});
  const analysis = {...mapTruthScanClassification(response.result_details), analyzed_at: new Date().toISOString()};
  const details = response.result_details;
  let hasHeatmap = false;
  let assetStatus = details.heatmap_status || 'skipped';
  if (assetStatus === 'ready') {
    try {
      const heatmap = await client.heatmap(job.job_id);
      if (heatmap) {
        await media.file(`users/${record.owner_uid}/scans/${record.scan_id}/heatmap.png`).save(heatmap, {
          resumable: false, metadata: {contentType: 'image/png', cacheControl: 'private, no-store'},
        });
        hasHeatmap = true;
      } else assetStatus = 'unavailable';
    } catch { assetStatus = 'storage_or_delivery_failed'; }
  }
  const rawReview = details.analysis_results;
  const text = typeof rawReview?.detailedReasoning === 'string'
    ? rawReview.detailedReasoning.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 8000) : '';
  return finish({
    analysis, has_heatmap: hasHeatmap,
    provider_job: {...job, status: 'done'},
    provider_review: {provider: 'truthscan', status: text ? 'ready' : 'unavailable', text,
      indicators: Array.isArray(rawReview?.keyIndicators)
        ? rawReview.keyIndicators.filter(item => typeof item === 'string').slice(0, 12).map(item => item.slice(0, 600)) : []},
    localization: {provider: 'truthscan', model_version: 'truthscan-generic',
      status: hasHeatmap ? 'available' : 'unavailable', asset_status: assetStatus,
      scope: 'provider_heatmap', input_sha256: record.file_sha256},
    object_detection: null, scene_analysis: null, feature_review: null,
    upload_review: {features: 'unavailable', source: 'truthscan'},
  });
}
