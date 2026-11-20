import {useEffect, useRef, useState} from 'react';
import {fetchSystemReadiness, fetchUserStats, uploadScanImage} from '../services/api';

// Both upload entry points share the same checks and in-flight lock.
// The backend remains responsible for enforcing allowance and releasing failed scans.
export default function useScanUpload() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(null);
  const uploadBusy = useRef(false);
  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
    uploadBusy.current = false;
  }, []);

  async function run(file) {
    if (uploadBusy.current) return;
    if (!file) { setError('Choose a JPG, PNG, or WebP image first.'); return; }
    const controller = new AbortController();
    active.current = controller;
    uploadBusy.current = true;
    setBusy(true); setError(''); setStage('Checking AI and daily allowance…');
    let submitted = false;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const [health, allowance] = await Promise.all([
        fetchSystemReadiness(controller.signal), fetchUserStats(controller.signal),
      ]);
      if (active.current !== controller) return;
      if (controller.signal.aborted) throw new Error('Readiness check timed out.');
      if (health?.data?.backend !== 'online' || health.data.ai !== 'ready') {
        throw new Error('The AI service is not ready. Start the AI service, wait for the model to load, then try again. No image was uploaded and no credit was used.');
      }
      const remaining = allowance?.data?.scans_remaining;
      if (remaining !== null && (!Number.isFinite(remaining) || remaining < 0)) {
        throw new Error('Could not confirm your daily allowance. No image was uploaded. Please retry.');
      }
      if (remaining === 0) {
        throw new Error('You have no scans remaining today. Your allowance resets at 12:00 AM Philippine time. History and PDF exports are still available. No image was uploaded.');
      }
      clearTimeout(timeout);
      setStage('Analyzing image and preparing explanations…');
      submitted = true;
      const response = await uploadScanImage(file, controller.signal);
      if (active.current !== controller || controller.signal.aborted) return;
      if (!response?.data?.scan_id) throw new Error('The server returned an incomplete response. Check History before trying again.');
      return response.data;
    } catch (failure) {
      if (active.current === controller) {
        setError(controller.signal.aborted && !submitted
          ? 'The readiness check timed out. No image was uploaded. Check your connection and retry.'
          : `${failure.message || 'Could not complete the request.'}${submitted ? ' Check History before uploading again; the image may already be saved.' : ''}`);
      }
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) {
        active.current = null; uploadBusy.current = false; setBusy(false); setStage('');
      }
    }
  }
  return {busy, stage, error, setError, uploadBusy, run};
}
