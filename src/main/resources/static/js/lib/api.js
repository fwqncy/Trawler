// JSON over fetch, with RFC 9457 problem details turned into readable errors.

export class ApiError extends Error {
  constructor(problem, status) {
    super(problem.detail || problem.title || 'Something went wrong.');
    this.title = problem.title || 'Something Went Wrong';
    this.status = status;
    this.fields = problem.errors || {};
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError({ title: 'Offline', detail: "Can't reach Trawler. Check the server is running, then try again." }, 0);
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(typeof data === 'object' ? data : { detail: data }, res.status);
  return data;
}

export const get = (path, options) => api(path, options);
export const post = (path, body) => api(path, { method: 'POST', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });

export async function text(path) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new ApiError({ detail: `Export failed (${res.status}).` }, res.status);
  return res.text();
}
