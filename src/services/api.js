const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

const TOKEN_KEY = 'authentiscan_token';
const USER_KEY = 'authentiscan_user';

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
    throw new Error(payload?.message || 'The request could not be completed.');
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
    throw new Error(payload?.message || 'The image could not be uploaded.');
  }

  return payload;
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

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
