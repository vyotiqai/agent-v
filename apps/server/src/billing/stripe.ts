import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors.ts";

/** The API version responses are parsed against. */
export const stripeApiVersion = "2025-03-31.basil";

type Params = Record<string, string | number | boolean | undefined>;

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  metadata: Record<string, string>;
  current_period_end?: number;
  items: {
    data: { id: string; quantity?: number; current_period_end?: number; price: { id: string } }[];
  };
}

/** A small Stripe client over its REST API: only the calls billing needs. */
export class Stripe {
  private readonly key: string;
  private readonly base: string;
  constructor(key: string, base: string) {
    this.key = key;
    this.base = base;
  }

  private async call<T>(method: string, path: string, params?: Params, idempotencyKey?: string) {
    const body = params
      ? new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]): [string, string] => [k, String(v)]),
        ).toString()
      : undefined;
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.key}`,
          "stripe-version": stripeApiVersion,
          ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new AppError("Billing is unavailable right now", 503);
    }
    const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!response.ok)
      throw new AppError(`Billing failed: ${data.error?.message ?? response.statusText}`, 502);
    return data as T;
  }

  createCustomer = (params: Params, idempotencyKey: string) =>
    this.call<{ id: string }>("POST", "/v1/customers", params, idempotencyKey);
  createCheckout = (params: Params) =>
    this.call<{ id: string; url: string }>("POST", "/v1/checkout/sessions", params);
  createPortal = (params: Params) =>
    this.call<{ url: string }>("POST", "/v1/billing_portal/sessions", params);
  getSubscription = (id: string) =>
    this.call<StripeSubscription>("GET", `/v1/subscriptions/${encodeURIComponent(id)}`);
  updateSubscription = (id: string, params: Params, idempotencyKey?: string) =>
    this.call<StripeSubscription>(
      "POST",
      `/v1/subscriptions/${encodeURIComponent(id)}`,
      params,
      idempotencyKey,
    );
  cancelSubscription = (id: string) =>
    this.call<StripeSubscription>("DELETE", `/v1/subscriptions/${encodeURIComponent(id)}`);
}

/**
 * Check a webhook's `Stripe-Signature` (HMAC-SHA256 over "timestamp.body") and its age, then
 * parse the event. Throws when the request did not come from Stripe.
 */
export function verifyWebhook(
  body: string,
  header: string | undefined,
  secret: string,
  toleranceSeconds = 300,
  now = Date.now(),
) {
  const parts = new Map<string, string[]>();
  for (const item of (header ?? "").split(",")) {
    const [k, v] = item.split("=", 2);
    if (k && v) parts.set(k.trim(), [...(parts.get(k.trim()) ?? []), v.trim()]);
  }
  const timestamp = Number(parts.get("t")?.[0]);
  if (!Number.isFinite(timestamp)) throw new AppError("Invalid signature", 400);
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds)
    throw new AppError("Signature too old", 400);
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const ok = (parts.get("v1") ?? []).some((sig) => {
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new AppError("Invalid signature", 400);
  return JSON.parse(body) as {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };
}

/** Build a Stripe-Signature header (for tests and local tooling). */
export function signWebhook(
  body: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}
