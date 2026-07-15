import { describe, expect, it } from "vitest";
import { buildSigninUrl, loginInterstitialHtml } from "./sso-login-page";

describe("buildSigninUrl", () => {
  it("carries the come-back URL under every common return-param alias", () => {
    const url = buildSigninUrl("https://id.travelify.io/signin.html", "https://auth.travelify.io/api/sso/start?return=%2F&state=abc");
    const encoded = encodeURIComponent("https://auth.travelify.io/api/sso/start?return=%2F&state=abc");
    for (const alias of ["redirect", "redirect_uri", "return", "returnUrl", "next"]) {
      expect(url).toContain(`${alias}=${encoded}`);
    }
    expect(url.startsWith("https://id.travelify.io/signin.html?redirect=")).toBe(true);
  });

  it("appends with & when the login URL already has a query", () => {
    const url = buildSigninUrl("https://id.travelify.io/signin.html?app=desk", "https://x/y");
    expect(url).toContain("?app=desk&redirect=");
  });
});

describe("loginInterstitialHtml", () => {
  it("renders the sign-in URL into the page (link + script)", () => {
    const html = loginInterstitialHtml({ signinUrl: "https://id.travelify.io/signin.html?redirect=x", checkPath: "/api/sso/check" });
    expect(html).toContain('href="https://id.travelify.io/signin.html?redirect=x"');
    expect(html).toContain('"/api/sso/check"');
  });

  it("neutralises a hostile URL — no script breakout, attributes escaped", () => {
    const hostile = 'https://x/"></script><script>alert(1)</script>';
    const html = loginInterstitialHtml({ signinUrl: hostile, checkPath: "/api/sso/check" });
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).not.toContain('href="https://x/"></script>');
    // The value is still present, just inert (attr-escaped in the link).
    expect(html).toContain("https://x/&quot;&gt;&lt;/script&gt;");
  });
});
