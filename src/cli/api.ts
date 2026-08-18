export type ApiOptions = {
  url: string;
  token?: string;
};

export class MatreshkaApi {
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
      const message = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: { message?: string } }).error?.message ?? response.statusText)
        : text || response.statusText;
      throw new Error(`Matreshka API ${response.status}: ${message}`);
    }
    return payload as T;
  }

  get<T>(path: string) { return this.request<T>("GET", path); }
  post<T>(path: string, body: unknown = {}) { return this.request<T>("POST", path, body); }
  patch<T>(path: string, body: unknown) { return this.request<T>("PATCH", path, body); }
  delete<T>(path: string) { return this.request<T>("DELETE", path); }
}

export function apiFromEnvironment() {
  const url = process.env.MATRESHKA_URL;
  if (!url) throw new Error("Задайте MATRESHKA_URL, например https://proxy.example.com");
  return new MatreshkaApi({ url, token: process.env.MATRESHKA_TOKEN });
}

function ensureSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}
