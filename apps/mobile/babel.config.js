module.exports = (api) => {
  api.cache(true);
  return {
    // Hermes rejects rest-parameter patterns emitted by oRPC 1.16.
    plugins: ["@babel/plugin-transform-parameters"],
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
