package agentv.modules.googlesignin

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Sign in with Google through Android's own sign-in sheet (Credential Manager; stage 6, section 3).
 * It returns Google's identity token, which carries the one-time nonce the API gave for this
 * sign-in (D141). The token is checked by our server, never trusted here.
 *
 * Errors carry a code the app turns into words: "cancelled" (the person closed the sheet: nothing
 * is said, as stage 4 asks), "no-account" (no Google account on the phone) and "failed".
 */
class GoogleSignInModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AgentVGoogleSignIn")

    AsyncFunction("signIn") Coroutine { serverClientId: String, nonce: String ->
      val activity = appContext.currentActivity
        ?: throw CodedException("failed", "There is no screen to show the sign-in sheet on.", null)
      val option = GetSignInWithGoogleOption.Builder(serverClientId).setNonce(nonce).build()
      val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
      val credential = try {
        CredentialManager.create(activity).getCredential(activity, request).credential
      } catch (e: GetCredentialCancellationException) {
        throw CodedException("cancelled", "Sign-in was cancelled.", e)
      } catch (e: NoCredentialException) {
        throw CodedException("no-account", "There is no Google account on this phone.", e)
      } catch (e: GetCredentialException) {
        throw CodedException("failed", "Google sign-in didn't complete.", e)
      }
      if (credential !is CustomCredential ||
        credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
      ) {
        throw CodedException("failed", "The sign-in sheet didn't return a Google credential.", null)
      }
      mapOf("idToken" to GoogleIdTokenCredential.createFrom(credential.data).idToken)
    }
  }
}
