/**
 * API utility functions for making HTTP requests
 */

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

type FetchOptions = RequestInit & { headers?: Record<string, string> };

/**
 * Make a GET request
 * @param url - API endpoint
 * @param options - Fetch options
 */
export async function get(url: string, options: FetchOptions = {}): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
    ...options,
  });
  return handleResponse(response);
}

/**
 * Make a POST request
 * @param url - API endpoint
 * @param data - Request body
 * @param options - Fetch options
 */
export async function post(
  url: string,
  data: unknown,
  options: FetchOptions = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
    body: JSON.stringify(data),
    ...options,
  });
  return handleResponse(response);
}

/**
 * Make a PUT request
 * @param url - API endpoint
 * @param data - Request body
 * @param options - Fetch options
 */
export async function put(
  url: string,
  data: unknown,
  options: FetchOptions = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
    body: JSON.stringify(data),
    ...options,
  });
  return handleResponse(response);
}

/**
 * Make a DELETE request
 * @param url - API endpoint
 * @param options - Fetch options
 */
export async function del(url: string, options: FetchOptions = {}): Promise<unknown> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: { ...DEFAULT_HEADERS, ...options.headers },
    ...options,
  });
  return handleResponse(response);
}

/**
 * Handle API response
 * @param response - Fetch response
 */
async function handleResponse(response: Response): Promise<unknown> {
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || "An error occurred") as Error & {
      status?: number;
      data?: unknown;
    };
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

const api = { get, post, put, del };
export default api;
