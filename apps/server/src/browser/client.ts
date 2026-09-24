import WebSocket from "ws";
import { AppError } from "../errors.ts";

export interface PageState {
  url: string;
  title: string;
}
export interface PageText extends PageState {
  text: string;
  truncated: boolean;
}

/** Thin client for the browser worker (apps/browser). */
export class BrowserClient {
  private readonly base: string;
  private readonly token: string;
  constructor(base: string, token: string) {
    this.base = base;
    this.token = token;
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new AppError("The browser is unavailable right now", 503);
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok)
      throw new AppError(
        data.error ?? "The browser failed",
        response.status === 401 ? 502 : (response.status as 400),
      );
    return data as T;
  }

  open = (id: string, url: string) =>
    this.call<PageState>(`/sessions/${id}/open`, { body: { url } });
  read = (id: string) => this.call<PageText>(`/sessions/${id}/read`);
  clickLink = (id: string, name: string) =>
    this.call<PageState>(`/sessions/${id}/click-link`, { body: { name } });
  close = (id: string) => this.call(`/sessions/${id}/close`, { body: {} });
  remove = (id: string) => this.call(`/sessions/${id}`, { method: "DELETE" });

  downloads = (id: string) =>
    this.call<{ id: string; name: string; size: number; savedAt: string }[]>(
      `/sessions/${id}/downloads`,
    );
  removeDownload = (id: string, downloadId: string) =>
    this.call(`/sessions/${id}/downloads/${downloadId}`, { method: "DELETE" });

  async downloadBytes(id: string, downloadId: string): Promise<Uint8Array> {
    const response = await fetch(`${this.base}/sessions/${id}/downloads/${downloadId}`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!response?.ok) throw new AppError("Download unavailable", 502);
    return new Uint8Array(await response.arrayBuffer());
  }

  async screenshot(id: string): Promise<ArrayBuffer> {
    const response = await fetch(`${this.base}/sessions/${id}/screenshot`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!response?.ok) throw new AppError("Screenshot unavailable", 502);
    return response.arrayBuffer();
  }

  /** Open the worker's live-view socket for a session. */
  live(id: string) {
    return new WebSocket(`${this.base.replace(/^http/, "ws")}/sessions/${id}/live`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
  }
}
