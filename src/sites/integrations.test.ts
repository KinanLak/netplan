import { describe, expect, it } from "bun:test";
import { normalizeBaseUrl, tokenError } from "./integrations";

describe("normalizeBaseUrl", () => {
  it("accepts the tool's address or its API's, and stores the tool's", () => {
    for (const raw of [
      "https://netbox.example.org",
      "https://netbox.example.org/",
      " https://netbox.example.org/api/ ",
    ]) {
      expect(normalizeBaseUrl("netbox", raw)).toEqual({
        url: "https://netbox.example.org",
      });
    }
    expect(
      normalizeBaseUrl("librenms", "https://nms.example.org/librenms/api/v0"),
    ).toEqual({ url: "https://nms.example.org/librenms" });
  });

  it("refuses what is not a plain http(s) address", () => {
    for (const raw of [
      "netbox.example.org",
      "ftp://netbox.example.org",
      "https://user:pw@netbox.example.org",
      "https://netbox.example.org/?token=x",
    ]) {
      expect(normalizeBaseUrl("netbox", raw)).toHaveProperty("error");
    }
  });
});

describe("tokenError", () => {
  it("refuses an empty token or one with spaces inside", () => {
    expect(tokenError("  ")).not.toBeNull();
    expect(tokenError("abc def")).not.toBeNull();
    expect(tokenError(" abc ")).toBeNull();
  });
});
