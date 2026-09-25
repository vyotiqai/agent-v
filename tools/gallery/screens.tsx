import { Privacy, type PrivacySource } from '@agentv/app/src/screens/Privacy.tsx';
import { Welcome } from '@agentv/app/src/screens/Welcome.tsx';
import type { Phone } from '@agentv/shared/accounts.ts';
import type { ReactNode } from 'react';

// The app's screens, drawn with made-up content like the design canvas's (the canvas's person is
// Ajay, with a Pixel 8 and a Pixel 6a). Design tooling: the app itself only ever shows real data.

const NOW = new Date('2026-09-25T12:00:00Z');

function phones(): Phone[] {
  return [
    {
      id: '0192c3a0-0000-7000-8000-000000000001',
      platform: 'android',
      model: 'Pixel 8',
      signedInAt: '2026-09-25T09:00:00Z',
      lastUsedAt: '2026-09-25T12:00:00Z',
      current: true,
    },
    {
      id: '0192c3a0-0000-7000-8000-000000000002',
      platform: 'android',
      model: 'Pixel 6a',
      signedInAt: '2026-08-02T09:00:00Z',
      lastUsedAt: '2026-09-22T10:00:00Z',
      current: false,
    },
  ];
}

/** A source that answers at once, or never, or fails, as the address asks: ?c=Privacy&state=… */
function privacySource(state: string | null): PrivacySource {
  let list = phones();
  const log = (what: string) => {
    (globalThis as { galleryLog?: string[] }).galleryLog ??= [];
    (globalThis as { galleryLog?: string[] }).galleryLog?.push(what);
  };
  return {
    phones: () =>
      state === 'loading'
        ? new Promise(() => {})
        : state === 'failed'
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(list),
    signOutPhone: async (id) => {
      log(`signOutPhone ${id}`);
      list = list.filter((p) => p.id !== id);
    },
    signOut: async () => log('signOut'),
  };
}

export const screens: Record<string, (state: string | null) => ReactNode> = {
  Welcome: (state) => (
    <Welcome
      onGoogle={async () => {
        await new Promise((r) => setTimeout(r, 50));
        if (state === 'cancelled') return { ok: false, reason: 'cancelled' };
        if (state === 'no-screen-lock') return { ok: false, reason: 'no-screen-lock' };
        if (state === 'failed') return { ok: false, reason: 'failed' };
        return { ok: true };
      }}
    />
  ),
  Privacy: (state) => <Privacy source={privacySource(state)} now={NOW} />,
};
