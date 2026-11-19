export function getStoredToken() {
  try {
    return localStorage.getItem('cf_token') || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem('cf_token', token);
    else localStorage.removeItem('cf_token');
  } catch {
    // ignore
  }
}

export async function apiRequest(path, body = null, tokenOverride = null) {
  const token = tokenOverride !== null ? tokenOverride : getStoredToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    // ignore
  }
  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível concluir a solicitação.');
  }
  return data;
}
