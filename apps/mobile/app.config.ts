import type { ConfigContext, ExpoConfig } from "expo/config";

/** "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc" */
function googleUrlScheme(iosClientId: string | undefined) {
  const id = iosClientId?.trim().replace(/\.apps\.googleusercontent\.com$/, "");
  return id ? `com.googleusercontent.apps.${id}` : null;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const scheme = googleUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  // The Google plugin aborts the native build without a URL scheme, so it is added only once the client ID exists.
  const plugins = scheme ? [...(config.plugins ?? []), ["@react-native-google-signin/google-signin", { iosUrlScheme: scheme }] as [string, unknown]] : config.plugins;
  return { ...config, name: config.name ?? "Bitora", slug: config.slug ?? "bitora", plugins };
};
