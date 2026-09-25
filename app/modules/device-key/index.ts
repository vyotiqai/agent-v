import { requireOptionalNativeModule } from 'expo';

interface DeviceKeyNative {
  create(alias: string): Promise<string>;
  remove(alias: string): Promise<void>;
}

/**
 * The phone's signing key, in its secure chip (D92, D142). Null where the native module isn't
 * built in: on the iPhone until slice 13 (D125), and in the web gallery.
 */
export const DeviceKey = requireOptionalNativeModule<DeviceKeyNative>('AgentVDeviceKey');

/** The one key the app keeps: made at sign-in, removed at sign-out. */
export const SIGNING_KEY_ALIAS = 'agent-v-signing-key';
