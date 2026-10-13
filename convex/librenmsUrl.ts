export const libreNmsApiBaseUrl = (configuredUrl: string): URL => {
  const withoutApi = configuredUrl
    .replace(/\/?api\/v0\/?$/, "")
    .replace(/\/$/, "");
  return new URL(`${withoutApi}/api/v0/`);
};
