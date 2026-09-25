import * as SecureStore from 'expo-secure-store';
import type { SessionStore, StoredSession } from '../api/client.ts';

const KEY = 'agent-v-session';

/**
 * The session kept between launches, in the phone's secure store (Keystore on Android, Keychain on
 * iPhone; stage 6, section 2): readable only by Agent V, only on this phone, only once it has been
 * unlocked since starting. Signing out erases it (D94).
 */
export const secureSessionStore: SessionStore = {
  async load() {
    const text = await SecureStore.getItemAsync(KEY);
    if (!text) return null;
    try {
      const value = JSON.parse(text) as StoredSession;
      return value.refreshToken && value.personId && value.phoneId ? value : null;
    } catch {
      return null;
    }
  },
  async save(session) {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async clear() {
    await SecureStore.deleteItemAsync(KEY);
  },
};
