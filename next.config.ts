import type { NextConfig } from "next";

// Baseline security headers on every response. Conservative set — no strict CSP
// yet (needs nonce wiring against Next's inline runtime), tracked as a follow-up.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS: the desk is HTTPS-only on Vercel. No `preload`/`includeSubDomains` —
  // avoids committing sibling *.travelify.io subdomains (widgets etc.) we don't own here.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
