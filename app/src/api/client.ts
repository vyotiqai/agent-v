import type {
  ApiErrorCode,
  GoogleSignInRequest,
  NonceResponse,
  Phone,
  PhonesResponse,
  Session,
} from '@agentv/shared/accounts.ts';

/**
 * The app's one way to talk to the API (stage 6, section 3). Plain TypeScript, so it runs and is
 * tested the same on a phone and in Node.
 *
 * - The refresh token is kept in the phone's secure store; the access token only in memory.
 * - An expired or refused access token is refreshed once, then the request is tried again.
 * - Only one refresh runs at a time: two at once would look to the API like a copied token, and
 *   sign this phone out (D96).
 * - When the API says this phone is signed out (another phone signed it out, or its token was
 *   copied), the stored session is cleared and the app returns to Welcome.
 */

/** What is kept between launches, in the secure store. Never the access token. */
export interface StoredSession {
  refreshToken: string;
  personId: string;
  phoneId: string;
}

export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

/** An answer the app turns into words: the API's kinds, and "offline" when it can't be reached. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | 'offline';
  readonly status: number;
  constructor(code: ApiErrorCode | 'offline', status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export interface ApiOptions {
  baseUrl: string;
  store: SessionStore;
  /** Called once when the API says this phone is no longer signed in. */
  onSignedOut: () => void;
  fetch?: typeof fetch;
  now?: () => number;
}

export class Api {
  readonly #base: string;
  readonly #store: SessionStore;
  readonly #onSignedOut: () => void;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  #access: { token: string; expires: number } | null = null;
  #stored: StoredSession | null = null;
  #refreshing: Promise<void> | null = null;

  constructor(options: ApiOptions) {
    this.#base = options.baseUrl.replace(/\/$/, '');
    this.#store = options.store;
    this.#onSignedOut = options.onSignedOut;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  /** Reads the stored session. True if this phone was signed in when the app last ran. */
  async start(): Promise<boolean> {
    this.#stored = await this.#store.load();
    return this.#stored !== null;
  }

  /** The phone's own id, once signed in. */
  get phoneId(): string | null {
    return this.#stored?.phoneId ?? null;
  }

  nonce(): Promise<NonceResponse> {
    return this.#send<NonceResponse>('POST', '/v1/auth/nonce', {}, null);
  }

  async signInWithGoogle(request: GoogleSignInRequest): Promise<void> {
    await this.#adopt(await this.#send<Session>('POST', '/v1/auth/google', request, null));
  }

  async phones(): Promise<Phone[]> {
    return (await this.#authed<PhonesResponse>('GET', '/v1/phones')).phones;
  }

  async signOutPhone(id: string): Promise<void> {
    await this.#authed<void>('DELETE', `/v1/phones/${encodeURIComponent(id)}`);
  }

  /** Signs this phone out: on the server when it can be reached, and here in any case. */
  async signOut(): Promise<void> {
    try {
      await this.#authed<void>('POST', '/v1/auth/sign-out');
    } catch (err) {
      // Offline, or already signed out: the session here is forgotten all the same, and the
      // server's copy expires unused.
      if (!(err instanceof ApiError)) throw err;
    }
    await this.#forget();
  }

  async #adopt(session: Session): Promise<void> {
    this.#stored = {
      refreshToken: session.refreshToken,
      personId: session.personId,
      phoneId: session.phoneId,
    };
    await this.#store.save(this.#stored);
    this.#access = { token: session.accessToken, expires: Date.parse(session.accessExpiresAt) };
  }

  async #forget(): Promise<void> {
    this.#access = null;
    this.#stored = null;
    await this.#store.clear();
  }

  #refresh(): Promise<void> {
    this.#refreshing ??= (async () => {
      try {
        const stored = this.#stored;
        if (!stored) throw new ApiError('signed-out', 401);
        const session = await this.#send<Session>(
          'POST',
          '/v1/auth/refresh',
          { refreshToken: stored.refreshToken },
          null,
        );
        await this.#adopt(session);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'signed-out') {
          await this.#forget();
          this.#onSignedOut();
        }
        throw err;
      } finally {
        this.#refreshing = null;
      }
    })();
    return this.#refreshing;
  }

  async #authed<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Refresh a little before the access token runs out, rather than waiting to be refused.
    if (!this.#access || this.#access.expires - this.#now() < 30_000) await this.#refresh();
    try {
      return await this.#send<T>(method, path, body, this.#access?.token ?? null);
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'unauthorized') throw err;
      await this.#refresh();
      return this.#send<T>(method, path, body, this.#access?.token ?? null);
    }
  }

  async #send<T>(method: string, path: string, body: unknown, token: string | null): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#base}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError('offline', 0);
    }
    if (response.status === 204) return undefined as T;
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      // A body that isn't JSON: judged by the status alone, below.
    }
    if (response.ok) return json as T;
    const code = (json as { error?: ApiErrorCode } | null)?.error ?? 'internal';
    throw new ApiError(code, response.status);
  }
}
