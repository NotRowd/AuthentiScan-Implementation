const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

const TOKEN_KEY = 'authentiscan_token';
const USER_KEY = 'authentiscan_user';

function handleUnauthorizedResponse() {
  clearAuthSession();
  window.dispatchEvent(new Event('auth-session-expired'));
}

function throwResponseError(response, payload, fallbackMessage) {
  if (response.status === 401) {
    handleUnauthorizedResponse();
  }

  throw new Error(payload?.message || fallbackMessage);
}

async function request(path, options = {}) {
  const { headers, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throwResponseError(response, payload, 'The request could not be completed.');
  }

  return payload;
}

export function registerAccount(details) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(details)
  });
}

export function loginAccount(credentials) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
}

export async function fetchSystemReadiness(signal) {
  const token = getAuthToken();
  if (!token) throw new Error('Please sign in to check system readiness.');
  return request('/system/health', {
    signal, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
  });
}

export async function uploadScanImage(image) {
  const token = getAuthToken();

  if (!token) {
    throw new Error('Please log in before uploading an image.');
  }

  const formData = new FormData();
  formData.append('image', image);

  const response = await fetch(`${API_BASE_URL}/scans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throwResponseError(response, payload, 'The image could not be uploaded.');
  }

  return payload;
}

export async function fetchUserScans({ q = '', status = 'all', limit = 20, offset = 0, signal } = {}) {
  const token = getAuthToken();

  if (!token) {
    throw new Error('Please log in before viewing your scan history.');
  }

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q.trim()) query.set('q', q.trim());
  if (status !== 'all') query.set('status', status);
  const response = await fetch(`${API_BASE_URL}/scans?${query}`, {
    method: 'GET',
    signal,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throwResponseError(response, payload, 'Failed to fetch scan history.');
  }

  return payload;
}

export async function fetchUserStats(signal) {
  const token = getAuthToken();

  if (!token) {
    throw new Error('Please log in before viewing stats.');
  }

  const response = await fetch(`${API_BASE_URL}/users/stats`, {
    method: 'GET',
    signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throwResponseError(response, payload, 'Failed to fetch user statistics.');
  }

  return payload;
}

export async function fetchScanDetails(scanId, signal) {
  if (!/^[1-9]\d*$/.test(String(scanId))) throw new Error('Invalid scan ID.');
  const token = getAuthToken();
  if (!token) throw new Error('Please sign in to view this scan.');
  const payload = await request(`/scans/${scanId}`, {
    signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` }
  });
  if (signal?.aborted || getAuthToken() !== token) throw new Error('Session changed. Please sign in again.');
  if (!payload?.data?.scan_id) throw new Error('The server returned an incomplete scan. Please try again.');
  return payload;
}

export async function fetchScanImage(scanId, signal) {
  if (!/^[1-9]\d*$/.test(String(scanId))) throw new Error('Invalid scan ID.');
  const token = getAuthToken();
  if (!token) throw new Error('Please sign in to view this image.');
  // Construct the owned-image endpoint locally; never send credentials to a returned media URL.
  const response = await fetch(`${API_BASE_URL}/scans/${scanId}/image`, {
    signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throwResponseError(response, await response.json().catch(() => null), 'Original image unavailable.');
  const blob = await response.blob();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || !blob.size || blob.size > 10 * 1024 * 1024) throw new Error('Original image unavailable.');
  if (signal?.aborted || getAuthToken() !== token) throw new Error('Session changed. Please sign in again.');
  return blob;
}

export async function fetchScanReport(scanId, signal) {
  if (!/^[1-9]\d*$/.test(String(scanId))) throw new Error('Invalid scan ID.');
  const token = getAuthToken();
  if (!token) throw new Error('Please log in before exporting a report.');
  const response = await fetch(`${API_BASE_URL}/scans/${scanId}/report`, {
    signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throwResponseError(response, payload, 'The report could not be exported. Please try again.');
  }
  if (response.headers.get('content-type')?.split(';')[0] !== 'application/pdf') throw new Error('The server did not return a PDF report.');
  const blob = await response.blob();
  if (!blob.size || blob.size > 16 * 1024 * 1024) throw new Error('The report response is empty or too large.');
  if ((await blob.slice(0,5).text()) !== '%PDF-') throw new Error('The report response is not a valid PDF.');
  if (signal?.aborted || getAuthToken() !== token) throw new Error('Session changed. Please sign in and export again.');
  return blob;
}

export function saveAuthSession(data, rememberUser) {
  const storage = rememberUser ? localStorage : sessionStorage;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);

  storage.setItem(TOKEN_KEY, data.token);
  storage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const userJson = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

export async function fetchMe() {
  const token = getAuthToken();

  if (!token) {
    throw new Error('Please log in first.');
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throwResponseError(response, payload, 'Failed to fetch user profile.');
  }

  return payload;
}
