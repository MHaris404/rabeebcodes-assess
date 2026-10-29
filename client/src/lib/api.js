let csrfToken = null;
export const setCsrf = value => { csrfToken = value; };
export class ApiError extends Error {
  constructor(status, error) { super(error.message || 'The request could not be completed.'); Object.assign(this, error, { status }); }
}
export async function api(path, { method = 'GET', body, signal, idempotencyKey, expectedVersion } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (expectedVersion !== undefined) headers['If-Match'] = String(expectedVersion);
  let response;
  try { response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}${path}`, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body), signal }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Cannot reach SupportDesk. Check your connection and try again.' }); }
  if (response.status === 204) return null;
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError(response.status, { code: 'INVALID_RESPONSE', message: 'The service returned an unexpected response. Try again shortly.' }); }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(response.status, data.error || {});
  }
  return data;
}
