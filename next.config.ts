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

// Staff desk lives under /staff; the client help centre is the site root. These
// legacy bases used to sit at the root (and the client portal under /portal), so
// old bookmarks + any internal link the move missed still resolve instead of 404ing.
const STAFF_BASES = [
  "home",
  "dashboard",
  "inbox",
  "proactive",
  "search",
  "analytics",
  "settings",
  "notifications",
  "clients",
  "ticket",
];

const nextConfig: NextConfig = {
  // Replies carry attachments and now inline (pasted) images in the action body,
  // so lift the default 1 MB server-action cap to the desk's attachment ceiling.
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    const staff = STAFF_BASES.flatMap((base) => [
      { source: `/${base}`, destination: `/staff/${base}`, permanent: false },
      { source: `/${base}/:path*`, destination: `/staff/${base}/:path*`, permanent: false },
    ]);
    return [
      // Client help centre moved from /portal to the site root.
      { source: "/portal", destination: "/", permanent: false },
      { source: "/portal/new", destination: "/new", permanent: false },
      { source: "/portal/ticket/:id", destination: "/tickets/:id", permanent: false },
      // Staff desk moved under /staff.
      ...staff,
      // KB: only the exact staff index moved. /kb/:id is the PUBLIC article page
      // at the root and must never redirect — so no /kb/:path* rule here.
      { source: "/kb", destination: "/staff/kb", permanent: false },
    ];
  },
};

export default nextConfig;
