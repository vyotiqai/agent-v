package agentv.modules.devicekey

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.ProviderException
import java.security.spec.ECGenParameterSpec

/**
 * The phone's signing key (stage 6, section 4; D92): a P-256 key made inside the phone's secure
 * chip (StrongBox where the phone has one, the trusted environment otherwise), which never leaves
 * it. Each use needs the fingerprint, face or the phone's PIN. Only the public half is given out,
 * to be registered with the API at sign-in (D142). Signing with it arrives with Spend and Can't
 * undo in slice 4.
 *
 * Errors: "no-screen-lock" when the phone has no screen lock, which the key requires; "failed".
 */
class DeviceKeyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AgentVDeviceKey")

    /** Makes a new key under the alias, replacing any old one, and returns its public half. */
    AsyncFunction("create") { alias: String ->
      // A key that needs the person to unlock it can only exist on a phone with a screen lock.
      val context = appContext.reactContext
        ?: throw CodedException("failed", "The app isn't ready.", null)
      val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      if (!keyguard.isDeviceSecure) {
        throw CodedException("no-screen-lock", "This phone has no screen lock.", null)
      }
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      if (store.containsAlias(alias)) store.deleteEntry(alias)
      val pair = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        try {
          generate(alias, strongBox = true)
        } catch (e: ProviderException) {
          // StrongBoxUnavailableException, named rather than caught by type so older Androids,
          // which don't have the class, can still load this code.
          if (e.javaClass.simpleName != "StrongBoxUnavailableException") throw e
          generate(alias, strongBox = false)
        }
      } else {
        generate(alias, strongBox = false)
      }
      Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP)
    }

    /** Deletes the key: on sign-out, so nothing signed with this phone can be signed again. */
    AsyncFunction("remove") { alias: String ->
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      if (store.containsAlias(alias)) store.deleteEntry(alias)
    }
  }

  private fun generate(alias: String, strongBox: Boolean) =
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").run {
      val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setUserAuthenticationRequired(true)
        .apply {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Every use asks again: fingerprint or face, or the phone's PIN.
            setUserAuthenticationParameters(
              0,
              KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
            )
          }
          if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setIsStrongBoxBacked(true)
        }
        .build()
      initialize(spec)
      generateKeyPair()
    }
}
