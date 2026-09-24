import { fetch as expoFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const configured = process.env.EXPO_PUBLIC_API_URL;
/** "/" means the web app is served by the API itself (the production image). */
export const API_URL = (
  configured === "/" && Platform.OS === "web"
    ? globalThis.location.origin
    : (configured ?? (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787"))
).replace(/\/$/, "");

const tokenKey = "agent-v.token";
let token: string | null = null;
let unauthorized: (() => void) | null = null;
let markReady: () => void = () => {};
// Requests wait until the stored session has been read, so a deep link never races sign-in.
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

export const session = {
  get token() {
    return token;
  },
  async load() {
    try {
      token =
        Platform.OS === "web"
          ? safe(() => localStorage.getItem(tokenKey))
          : await SecureStore.getItemAsync(tokenKey);
    } finally {
      markReady();
    }
    return token;
  },
  async save(value: string | null) {
    token = value;
    if (Platform.OS === "web")
      safe(() =>
        value ? localStorage.setItem(tokenKey, value) : localStorage.removeItem(tokenKey),
      );
    else if (value) await SecureStore.setItemAsync(tokenKey, value);
    else await SecureStore.deleteItemAsync(tokenKey);
  },
  onUnauthorized(handler: () => void) {
    unauthorized = handler;
  },
};

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const headers = (json: boolean): Record<string, string> => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error pages fall through to the generic message.
  }
  if (!response.ok) {
    if (response.status === 401) unauthorized?.();
    const body = data as { error?: string; message?: string } | null;
    throw new ApiError(
      body?.error ?? body?.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  return data as T;
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  await ready;
  const json = init.body !== undefined;
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (json ? "POST" : "GET"),
    headers: headers(json),
    body: json ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  return parse<T>(response);
}

/** A fetch whose body can be read as a stream on every platform (SSE). */
export async function stream(
  path: string,
  init: { body?: unknown; signal?: AbortSignal } = {},
): Promise<ReadableStream<Uint8Array>> {
  await ready;
  const json = init.body !== undefined;
  const run = Platform.OS === "web" ? fetch : (expoFetch as unknown as typeof fetch);
  const response = await run(`${API_URL}${path}`, {
    method: json ? "POST" : "GET",
    headers: { ...headers(json), accept: "text/event-stream" },
    body: json ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  if (!response.ok || !response.body) await parse(response);
  return response.body as ReadableStream<Uint8Array>;
}

async function authenticate(path: string, body: Record<string, string>) {
  const response = await fetch(`${API_URL}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const header = response.headers.get("set-auth-token");
  const data = await parse<{ token?: string }>(response);
  const value = header ?? data.token;
  if (!value) throw new ApiError("Sign-in did not return a session", 500);
  await session.save(value);
}

export const accounts = {
  signIn: (email: string, password: string) => authenticate("sign-in/email", { email, password }),
  signUp: (name: string, email: string, password: string) =>
    authenticate("sign-up/email", { name, email, password }),
  async signOut() {
    await api("/api/auth/sign-out", { body: {} }).catch(() => {});
    await session.save(null);
  },
};

/** Upload a picked file as multipart form data (web File or native { uri, name, type }). */
export async function upload<T>(
  path: string,
  file: File | Blob | { uri: string; name: string; type: string },
  fallbackName = "upload.pdf",
) {
  await ready;
  const form = new FormData();
  form.append("file", file as unknown as Blob, "name" in file ? file.name : fallbackName);
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: headers(false),
    body: form,
  });
  return parse<T>(response);
}
