// The SSO bridge's "sign in to continue" page + its URL builder. Pure module
// (no server-only / React) so the escaping and URL logic are unit-testable.
//
// Why a page instead of a plain redirect: id.travelify.io/signin.html doesn't
// reliably send the user back to the URL we ask for, so a bare redirect strands
// them on the Travelify side after login. This page (served on auth.travelify.io,
// which CAN see the tg_session cookie) opens the sign-in in a popup and polls
// /api/sso/check; the moment the session exists it reloads itself, which
// completes the bridge handshake and lands the user back where they started —
// regardless of where signin.html leaves the popup.

/** Build the signin.html URL carrying the come-back address under the common
 *  return-param aliases — if id honours any one of them, the popup itself sails
 *  straight back and completes the handshake; if it honours none, the polling
 *  page completes it instead. */
export function buildSigninUrl(loginUrl: string, back: string): string {
  const sep = loginUrl.includes("?") ? "&" : "?";
  const encoded = encodeURIComponent(back);
  const aliases = ["redirect", "redirect_uri", "return", "returnUrl", "next"];
  return `${loginUrl}${sep}${aliases.map((a) => `${a}=${encoded}`).join("&")}`;
}

/** Embed a value in an inline <script> without breaking out of it. */
function js(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** Escape a value for an HTML attribute. */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The interstitial served by /api/sso/start when the browser has no valid
 *  Travelgenix session. Self-contained (inline CSS/JS, no assets). */
export function loginInterstitialHtml(opts: { signinUrl: string; checkPath: string }): string {
  const { signinUrl, checkPath } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in — Travelgenix Support</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body {
    min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f4f5f8; color: #1a1d26; padding: 16px;
  }
  .card {
    width: 100%; max-width: 420px; background: #fff; border: 1px solid #e3e5ec;
    border-radius: 16px; padding: 28px; box-shadow: 0 20px 45px -22px rgba(27,43,91,.35);
    text-align: center;
  }
  .logo {
    width: 40px; height: 40px; border-radius: 10px; background: #1b2b5b; color: #fff;
    font-size: 18px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center;
  }
  h1 { font-size: 18px; margin-top: 14px; letter-spacing: -.01em; }
  p { font-size: 14px; line-height: 1.55; color: #555b6e; margin-top: 8px; }
  button {
    margin-top: 18px; width: 100%; padding: 11px 16px; border: 0; border-radius: 10px;
    background: #1b2b5b; color: #fff; font-size: 14px; font-weight: 500; cursor: pointer;
  }
  button:hover { background: #2a3f7a; }
  button:disabled { opacity: .65; cursor: default; }
  .status { display: none; margin-top: 14px; font-size: 13px; color: #555b6e; }
  .status.on { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .spin {
    width: 14px; height: 14px; border: 2px solid #b6c2de; border-top-color: #1b2b5b;
    border-radius: 50%; animation: r 1s linear infinite;
  }
  @keyframes r { to { transform: rotate(360deg); } }
  .alts { margin-top: 16px; font-size: 12px; color: #7a8093; }
  .alts a { color: #2a3f7a; }
</style>
</head>
<body>
<main class="card">
  <span class="logo" aria-hidden="true">T</span>
  <h1>Sign in to continue</h1>
  <p>We&rsquo;ll open the Travelgenix sign-in in a new window. Once you&rsquo;ve signed in, this page carries on by itself and takes you back to where you were.</p>
  <button id="open" type="button">Open sign-in</button>
  <p class="status" id="status" aria-live="polite"><span class="spin" aria-hidden="true"></span> Waiting for you to finish signing in&hellip;</p>
  <p class="alts">
    Nothing happening? <a href="${attr(signinUrl)}">Sign in on this page instead</a><br>
    Already signed in? <a href="#" id="continue">Continue</a>
  </p>
</main>
<script>
(function () {
  var SIGNIN = ${js(signinUrl)};
  var CHECK = ${js(checkPath)};
  var popup = null, tries = 0, MAX = 120; // ~5 minutes at 2.5s

  function done() {
    try { if (popup && !popup.closed) popup.close(); } catch (e) {}
    location.reload(); // re-runs /api/sso/start, which now completes the handshake
  }
  function check() {
    if (++tries > MAX) return; // stop polling; the manual links still work
    fetch(CHECK, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.signedIn) done(); })
      .catch(function () {});
  }
  setInterval(check, 2500);
  check();

  document.getElementById("open").addEventListener("click", function () {
    popup = window.open(SIGNIN, "tg-signin", "width=520,height=680");
    if (!popup) { location.href = SIGNIN; return; } // popup blocked — same-tab fallback
    this.disabled = true;
    document.getElementById("status").className = "status on";
  });
  document.getElementById("continue").addEventListener("click", function (e) {
    e.preventDefault();
    done();
  });
})();
</script>
</body>
</html>`;
}
