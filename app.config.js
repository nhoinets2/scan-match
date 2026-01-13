module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    [
      "expo-camera",
      {
        cameraPermission: "Scan & Match needs your camera to scan clothing items while you shop and find matching pieces from your wardrobe.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Scan & Match needs access to your photos to analyze clothing items.",
      },
    ],
  ],
});

