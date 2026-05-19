import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// In-memory token (sandboxed iframe blocks localStorage)
let authToken: string | null = null;
const tokenListeners = new Set<(t: string | null) => void>();

export function setAuthToken(token: string | null) {
  authToken = token;
  tokenListeners.forEach((fn) => fn(token));
}
export function getAuthToken(): string | null {
  return authToken;
}
export function subscribeToken(fn: (t: string | null) => void) {
  tokenListeners.add(fn);
  return () => tokenListeners.delete(fn);
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.clone().json();
      if (data?.message) message = data.message;
    } catch {
      try {
        const t = await res.text();
        if (t) message = t;
      } catch {}
    }
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/");
    const res = await fetch(`${API_BASE}${url}`, { headers: authHeaders() });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export const API_URL = (path: string) => `${API_BASE}${path}`;
