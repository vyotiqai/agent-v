// The settings a build is made with. Expo writes each `process.env.EXPO_PUBLIC_…` into the app when
// it is built, so staging and production builds differ only in these.
declare namespace NodeJS {
  interface ProcessEnv {
    /** The API's address, for example https://api.staging.… */
    EXPO_PUBLIC_API_URL?: string;
    /** Agent V's server client id in Google Cloud, which Google's sign-in sheet issues tokens for. */
    EXPO_PUBLIC_GOOGLE_CLIENT_ID?: string;
  }
}
