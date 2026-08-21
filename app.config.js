const appJson = require("./app.json");

const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

const plugins = appJson.expo.plugins || [];
const hasBuildProperties = plugins.some((plugin) =>
  Array.isArray(plugin) ? plugin[0] === "expo-build-properties" : plugin === "expo-build-properties",
);

if (!googleMapsApiKey) {
  console.warn(
    "GOOGLE_MAPS_API_KEY is not set. Android release builds will crash when Google Maps opens.",
  );
}

module.exports = () => ({
  ...appJson.expo,
  slug: appJson.expo.slug || "kindredcube",
  extra: {
    ...appJson.expo.extra,
    eas: {
      projectId: process.env.EAS_PROJECT_ID || "5c3cd481-5be9-475d-898e-12748ea10e98",
    },
  },
  android: {
    ...appJson.expo.android,
    config: {
      ...appJson.expo.android?.config,
      googleMaps: {
        ...appJson.expo.android?.config?.googleMaps,
        apiKey: googleMapsApiKey,
      },
    },
  },
  plugins: hasBuildProperties
    ? plugins
    : [
        ...plugins,
        [
          "expo-build-properties",
          {
            android: {
              usesCleartextTraffic: false,
            },
          },
        ],
      ],
});
