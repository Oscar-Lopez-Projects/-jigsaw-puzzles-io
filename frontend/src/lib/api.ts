const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  retries?: number; // how many times to retry on cold-start HTML responses
}

export async function apiFetch<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, retries = 2 } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let lastError: Error = new Error('Request failed');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // If the server returned HTML (cold-start 502/503), wait and retry
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      lastError = new Error('Server is starting up, please wait a moment…');
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw lastError;
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }

    return data as T;
  }

  throw lastError;
}
