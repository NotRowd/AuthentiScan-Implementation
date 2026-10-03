import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { API_BASE_URL, OFFLINE_MODE, validateBaseUrl } from '../api/config';
import { clearSession, getToken, sessionRevision } from '../api/session';

const LIMIT = 16 * 1024 * 1024;
let exporting = false;

/** Fetch a saved report only. Never upload an image or call AI inference. */
export async function downloadScanReport(scanId: string, signal?: AbortSignal, timeoutMs = 20000) {
  if (OFFLINE_MODE) throw new Error('PDF export needs a saved backend scan, not an offline sample.');
  if (!/^[1-9]\d*$/.test(scanId) || !Number.isSafeInteger(Number(scanId))) throw new Error('Invalid saved scan ID.');
  validateBaseUrl(API_BASE_URL);
  const token = await getToken();
  if (!token) throw new Error('Please sign in before exporting a report.');
  const revision = sessionRevision();
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel);
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    if (controller.signal.aborted) throw new Error('Export cancelled.');
    const response = await fetch(`${API_BASE_URL}/api/v1/scans/${scanId}/report`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
      signal: controller.signal, redirect: 'error', cache: 'no-store',
    });
    if (revision !== sessionRevision()) throw new Error('Session changed. Please sign in again.');
    if (response.status === 401) {
      await clearSession(token);
      throw new Error('Your session expired. Please sign in again.');
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || (response.status === 404
        ? 'Saved report was not found. Refresh History and check that the backend is updated.'
        : 'The report could not be exported. Please try again.'));
    }
    if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf')
      throw new Error('The server did not return a PDF report.');
    if (Number(response.headers.get('content-length')) > LIMIT) throw new Error('The PDF report is too large.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > LIMIT) throw new Error('The PDF report is empty or too large.');
    if ([37, 80, 68, 70, 45].some((value, index) => bytes[index] !== value)) throw new Error('The report response is not a valid PDF.');
    if (controller.signal.aborted || revision !== sessionRevision()) throw new Error('Export cancelled or session changed.');
    return { bytes, revision };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timedOut
      ? 'PDF export timed out. No scan credit was used. Please try again.' : 'PDF export cancelled.');
    if (error instanceof Error && /network request failed|fetch failed|failed to fetch|connection reset|socketexception|econnrefused/i.test(error.message))
      throw new Error('Cannot download the PDF. Check the backend connection and try again. No scan credit was used.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function shareSavedScanReport(scanId: string, signal?: AbortSignal) {
  if (exporting) throw new Error('Another PDF export is already open. Please finish it first.');
  exporting = true;
  let file: File | undefined;
  let handedToShareSheet = false;
  try {
    if (OFFLINE_MODE) throw new Error('PDF export is unavailable for offline samples.');
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new Error('Use web History to export a PDF in your browser.');
    if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device. You can export from web History.');
    if (signal?.aborted) throw new Error('PDF export cancelled.');
    const { bytes, revision } = await downloadScanReport(scanId, signal);
    if (signal?.aborted || revision !== sessionRevision()) throw new Error('Export cancelled or session changed.');
    const directory = new Directory(Paths.cache, 'authentiscan-report-exports');
    directory.create({ intermediates: true, idempotent: true });
    // Android may resolve the chooser before another app finishes reading.
    // Keep handed-off PDFs in private cache; prune only our >24h-old files.
    try {
      for (const entry of directory.list()) {
        if (!(entry instanceof File)) continue;
        const match = /^AuthentiScan-scan-[1-9]\d*-(\d+)\.pdf$/.exec(entry.name);
        if (match && Number(match[1]) < Date.now() - 86400000) entry.delete();
      }
    } catch { /* OS cache cleanup can also reclaim old reports. */ }
    file = new File(directory, `AuthentiScan-scan-${scanId}-${Date.now()}.pdf`);
    file.create();
    file.write(bytes);
    if (signal?.aborted || revision !== sessionRevision()) throw new Error('Export cancelled or session changed.');
    handedToShareSheet = true;
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save or share AuthentiScan report' });
    // The OS does not reliably distinguish cancellation from a completed save.
  } finally {
    if (file && !handedToShareSheet) { try { if (file.exists) file.delete(); } catch { /* Best-effort cache cleanup. */ } }
    exporting = false;
  }
}
