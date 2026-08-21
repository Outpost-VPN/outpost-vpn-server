export type ApiOptions = {
  url: string;
  token?: string;
};

export class OutpostApi {
  constructor(private options: ApiOptions) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers({ accept: "application/json" });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (this.options.token) headers.set("authorization", `Bearer ${this.options.token}`);
    const response = await fetch(new URL(path, ensureSlash(this.options.url)), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? safeJson(text) : null;
    if (!response.ok) {
      const message = errorMessage(payload, text, response.statusText);
      throw new Error(`Outpost API ${response.status}: ${message}`);
    }
    return payload as T;
  }

  get<T>(path: string) { return this.request<T>("GET", path); }
  post<T>(path: string, body: unknown = {}) { return this.request<T>("POST", path, body); }
  patch<T>(path: string, body: unknown) { return this.request<T>("PATCH", path, body); }
  delete<T>(path: string) { return this.request<T>("DELETE", path); }
}

export function apiFromEnvironment() {
  const url = process.env.OUTPOST_URL;
  if (!url) throw new Error("Задайте OUTPOST_URL, например https://proxy.example.com");
  return new OutpostApi({ url, token: process.env.OUTPOST_TOKEN });
}

function ensureSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}

function errorMessage(payload: unknown, text: string, statusText: string) {
  if (payload && typeof payload === "object") {
    const error = payload as { message?: unknown; error?: { message?: unknown } };
    if (typeof error.message === "string" && error.message) return error.message;
    if (typeof error.error?.message === "string" && error.error.message) return error.error.message;
  }
  return text || statusText;
}
