import { describe, expect, it } from "vitest";
import { isPublicAddress, parseWebUrl, resolvePublic } from "../src/index.ts";

describe("resolvePublic", () => {
  it("rejects private literals and names unless allowed", async () => {
    await expect(resolvePublic("127.0.0.1")).rejects.toThrow(/private or reserved/);
    await expect(resolvePublic("[::1]")).rejects.toThrow(/private or reserved/);
    await expect(resolvePublic("printer.local")).rejects.toThrow(/private host name/);
    await expect(resolvePublic("localhost")).rejects.toThrow(/private host name/);
    expect(await resolvePublic("127.0.0.1", { allowPrivate: true })).toEqual([
      { address: "127.0.0.1", family: 4 },
    ]);
  });

  it("accepts public literals without a lookup", async () => {
    expect(await resolvePublic("8.8.8.8")).toEqual([{ address: "8.8.8.8", family: 4 }]);
    expect(isPublicAddress("169.254.169.254")).toBe(false);
  });
});

describe("parseWebUrl", () => {
  it("allows only plain http(s)", () => {
    expect(parseWebUrl("https://example.com/a").host).toBe("example.com");
    expect(() => parseWebUrl("javascript:alert(1)")).toThrow(/http and https/);
    expect(() => parseWebUrl("https://a:b@example.com")).toThrow(/credentials/);
    expect(() => parseWebUrl("not a url")).toThrow(/valid URL/);
  });
});
