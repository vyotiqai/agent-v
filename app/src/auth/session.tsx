import * as Device from 'expo-device';
import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { DeviceKey, SIGNING_KEY_ALIAS } from '../../modules/device-key/index.ts';
import { GoogleSignIn } from '../../modules/google-sign-in/index.ts';
import { Api, ApiError } from '../api/client.ts';
import { config } from '../config.ts';
import { secureSessionStore } from './secureStore.ts';

/**
 * Whether this phone is signed in, and signing in and out (stage 6, section 3; slice 1).
 *
 * Signing in, in order: a one-time nonce from the API (D141); a new signing key in the phone's
 * secure chip (D142); Google's own sign-in sheet, which returns an identity token carrying the
 * nonce; then the API checks the token and registers this phone with the public half of its key.
 */

export type SignInResult =
  | { ok: true }
  /** The person closed Google's sheet: nothing is said (stage 4). */
  | { ok: false; reason: 'cancelled' }
  /** The phone has no screen lock, which its signing key needs. */
  | { ok: false; reason: 'no-screen-lock' }
  /** Anything else: "Couldn't sign in with Google · Try again". */
  | { ok: false; reason: 'failed' };

type Status = 'starting' | 'signed-out' | 'signed-in';

interface SessionValue {
  status: Status;
  api: Api;
  signIn: () => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const codeOf = (err: unknown): string | undefined =>
  (err as { code?: unknown } | null)?.code as string;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('starting');
  const api = useMemo(
    () =>
      new Api({
        baseUrl: config.apiUrl,
        store: secureSessionStore,
        // Signed out elsewhere, or a copied token was caught: the key goes too, and back to Welcome.
        onSignedOut: () => {
          DeviceKey?.remove(SIGNING_KEY_ALIAS).catch(() => {});
          setStatus('signed-out');
        },
      }),
    [],
  );

  useEffect(() => {
    api.start().then(
      (signedIn) => setStatus(signedIn ? 'signed-in' : 'signed-out'),
      () => setStatus('signed-out'),
    );
  }, [api]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      api,
      async signIn() {
        if (!GoogleSignIn || !DeviceKey) return { ok: false, reason: 'failed' };
        let keyMade = false;
        try {
          const { nonce } = await api.nonce();
          const signingKey = await DeviceKey.create(SIGNING_KEY_ALIAS);
          keyMade = true;
          const { idToken } = await GoogleSignIn.signIn(config.googleClientId, nonce);
          await api.signInWithGoogle({
            idToken,
            nonce,
            phone: {
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              model:
                (Device.modelName ?? '').trim() ||
                (Platform.OS === 'ios' ? 'iPhone' : 'Android phone'),
              signingKey,
            },
          });
          setStatus('signed-in');
          return { ok: true };
        } catch (err) {
          // A key made for a sign-in that didn't finish is removed, so no stray key stays behind.
          if (keyMade) DeviceKey.remove(SIGNING_KEY_ALIAS).catch(() => {});
          const code = err instanceof ApiError ? err.code : codeOf(err);
          if (code === 'cancelled') return { ok: false, reason: 'cancelled' };
          if (code === 'no-screen-lock') return { ok: false, reason: 'no-screen-lock' };
          return { ok: false, reason: 'failed' };
        }
      },
      async signOut() {
        await api.signOut();
        await DeviceKey?.remove(SIGNING_KEY_ALIAS).catch(() => {});
        setStatus('signed-out');
      },
    }),
    [status, api],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession is used outside SessionProvider.');
  return value;
}
