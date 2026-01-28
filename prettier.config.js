//  @ts-check

/** @type {import('prettier').Config & import("prettier-plugin-tailwindcss").PluginOptions} */

const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheets: ["./src/styles.css"],
  semi: true,
  singleQuote: false,
  trailingComma: "all",
};

export default config;
