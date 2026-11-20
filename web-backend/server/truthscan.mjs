import sharp from 'sharp';
import {setTimeout as delay} from 'node:timers/promises';

const ORIGIN = 'https://detect-image.truthscan.com';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function failure(code, message) {
  return Object.assign(new Error(message), {code});
}

async function readLimited(response, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw failure('TRUTHSCAN_RESPONSE_INVALID', 'TruthScan response exceeded the size limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function storageUrl(value) {
  const url = new URL(value);
  // Upload credentials must only be sent to the provider's documented storage.
  if (url.protocol !== 'https:' || url.username || url.password ||
      !(url.hostname === 'image-presigned-upload.ai-assets-cdn.com' ||
        /^[a-z0-9.-]+\.digitaloceanspaces\.com$/i.test(url.hostname)) || url.port) {
    throw failure('TRUTHSCAN_RESPONSE_INVALID', 'Unrecognized TruthScan storage URL.');
  }
  return url;
}

export function validateTruthScanResult(payload, id) {
  if (!payload || payload.id !== id || !UUID.test(id) ||
      !['pending', 'analyzing', 'processing', 'done', 'failed', 'error'].includes(payload.status)) {
    throw failure('TRUTHSCAN_RESPONSE_INVALID', 'Invalid TruthScan job response.');
  }
  if (payload.status === 'done') {
    const details = payload.result_details;
    if (!details || details.is_valid === false || typeof details.final_result !== 'string' ||
        !details.final_result.trim() || details.final_result.length > 100 ||
        !Number.isFinite(details.final_label_confidence) ||
        details.final_label_confidence < 0 || details.final_label_confidence > 100) {
      throw failure('TRUTHSCAN_RESPONSE_INVALID', 'TruthScan returned an invalid classification.');
    }
  }
  return payload;
}

export function createTruthScanClient({apiKey, fetchImpl = fetch, wait = delay} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /\s/.test(apiKey)) {
    throw failure('TRUTHSCAN_NOT_CONFIGURED', 'Configure the TruthScan backend API key.');
  }

  async function request(path, {method = 'POST', body, signal, headers = {}} = {}) {
    const response = await fetchImpl(ORIGIN + path, {
      method, redirect: 'error', signal: AbortSignal.any([
        AbortSignal.timeout(30000), ...(signal ? [signal] : []),
      ]),
      headers: {...headers, ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
    if (!response.ok) {
      if (response.status === 429) throw failure('TRUTHSCAN_RATE_LIMIT', 'TruthScan is busy. Wait before checking again.');
      if ([402, 403].includes(response.status)) throw failure('TRUTHSCAN_ACCESS', 'TruthScan rejected access. Check the key and remaining credits.');
      throw failure('TRUTHSCAN_UNAVAILABLE', 'TruthScan could not complete this request.');
    }
    return response;
  }

  async function json(path, options) {
    const response = await request(path, options);
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw failure('TRUTHSCAN_RESPONSE_INVALID', 'Expected a TruthScan JSON response.');
    }
    return JSON.parse((await readLimited(response, 256 * 1024)).toString('utf8'));
  }

  async function credits(signal) {
    const balance = await json('/check-user-credits', {method: 'GET', headers: {apikey: apiKey}, signal});
    if (!Number.isFinite(balance.credits) || balance.credits < 0) {
      throw failure('TRUTHSCAN_RESPONSE_INVALID', 'Invalid TruthScan credit balance.');
    }
    return balance;
  }

  async function submit(bytes, {id, saveJob, signal} = {}) {
    if (!UUID.test(id || '') || typeof saveJob !== 'function') {
      throw new Error('A stable scan UUID and durable job callback are required.');
    }
    if (!Buffer.isBuffer(bytes) || bytes.length < 1024 || bytes.length > MAX_IMAGE_BYTES) {
      throw new Error('TruthScan requires an image between 1 KB and 10 MB.');
    }
    const metadata = await sharp(bytes, {limitInputPixels: 16000000, failOn: 'error'}).metadata();
    const type = {jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'}[metadata.format];
    if (!type || metadata.pages > 1) throw new Error('Unsupported TruthScan input image.');
    const extension = {jpeg: 'jpg', png: 'png', webp: 'webp'}[metadata.format];
    const upload = await json('/get-presigned-url?file_name=' + id + '.' + extension, {
      method: 'GET', headers: {apikey: apiKey}, signal,
    });
    const url = storageUrl(upload.presigned_url);
    if (typeof upload.file_path !== 'string' || !upload.file_path ||
        upload.file_path.startsWith('/') || upload.file_path.includes('..') || upload.file_path.includes('?')) {
      throw failure('TRUTHSCAN_RESPONSE_INVALID', 'Invalid TruthScan upload path.');
    }
    // Persist before any potentially chargeable call. Never retry /detect automatically.
    await saveJob({provider: 'truthscan', job_id: id, status: 'uploading'});
    const uploaded = await fetchImpl(url.href, {
      method: 'PUT', body: bytes, headers: {'Content-Type': type, 'x-amz-acl': 'private'}, redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(45000), ...(signal ? [signal] : [])]),
    });
    if (!uploaded.ok) throw failure('TRUTHSCAN_UPLOAD_FAILED', 'TruthScan image upload failed.');
    const storageOrigin = url.hostname === 'image-presigned-upload.ai-assets-cdn.com'
      ? 'https://ai-image-detector-prod.nyc3.digitaloceanspaces.com'
      : url.origin;
    const imageUrl = new URL(upload.file_path, storageOrigin + '/').href;
    await saveJob({provider: 'truthscan', job_id: id, status: 'submission_started'});
    const accepted = await json('/detect', {signal, body: {
      key: apiKey, id, url: imageUrl, model: 'generic', generate_preview: false,
      generate_heatmap: true, generate_heatmap_overlayed: true,
      generate_analysis_details: true,
    }});
    if (!UUID.test(accepted.id || '') || !['pending', 'analyzing', 'processing', 'done'].includes(accepted.status)) {
      throw failure('TRUTHSCAN_RESPONSE_INVALID', 'Invalid TruthScan submission response.');
    }
    await saveJob({provider: 'truthscan', job_id: accepted.id, status: accepted.status});
    return accepted.id;
  }

  async function query(id, signal) {
    if (!UUID.test(id || '')) throw new Error('Invalid TruthScan job ID.');
    return validateTruthScanResult(await json('/query', {body: {id}, signal}), id);
  }

  async function poll(id, {signal, timeoutMs = 180000, intervalMs = 2000} = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 ||
        !Number.isFinite(intervalMs) || intervalMs < 100) throw new Error('Invalid polling limits.');
    const deadline = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
    try {
      while (true) {
        deadline.throwIfAborted();
        const result = await query(id, deadline);
        if (['failed', 'error'].includes(result.status)) {
          throw failure('TRUTHSCAN_ANALYSIS_FAILED', 'TruthScan analysis failed.');
        }
        if (result.status === 'done') {
          const d = result.result_details;
          const pending = ['pending', 'analyzing', 'processing'];
          if (!pending.includes(d.heatmap_status) && !pending.includes(d.analysis_results_status)) return result;
        }
        await wait(intervalMs, undefined, {signal: deadline});
      }
    } catch (error) {
      if (deadline.aborted && !signal?.aborted) {
        throw failure('TRUTHSCAN_PENDING', 'Analysis is still pending. Resume this saved job without submitting the image again.');
      }
      throw error;
    }
  }

  async function heatmap(id, signal) {
    if (!UUID.test(id || '')) throw new Error('Invalid TruthScan job ID.');
    const response = await request('/heatmap/' + id, {body: {key: apiKey}, signal});
    if (response.status === 202 || response.headers.get('content-type')?.includes('application/json')) return null;
    const bytes = await readLimited(response, MAX_IMAGE_BYTES);
    const image = sharp(bytes, {limitInputPixels: 16000000, failOn: 'error'});
    const meta = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format) || meta.pages > 1) throw new Error('Invalid TruthScan heatmap image.');
    return image.png().toBuffer();
  }

  return {credits, submit, query, poll, heatmap};
}
