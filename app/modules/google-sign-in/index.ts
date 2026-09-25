import { requireOptionalNativeModule } from 'expo';

interface GoogleSignInNative {
  signIn(serverClientId: string, nonce: string): Promise<{ idToken: string }>;
}

/**
 * Sign in with Google through Android's own sign-in sheet. Null where the native module isn't
 * built in: on the iPhone until slice 13 (D125), and in the web gallery.
 */
export const GoogleSignIn = requireOptionalNativeModule<GoogleSignInNative>('AgentVGoogleSignIn');

/** The codes the native module rejects with. */
export type GoogleSignInErrorCode = 'cancelled' | 'no-account' | 'failed';
