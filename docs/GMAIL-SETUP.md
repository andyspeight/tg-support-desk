# Gmail setup for TG Support Desk

**For:** whoever administers the Travelgenix Google Workspace / Google Cloud
**Goal:** let the support desk read new mail arriving at `help@travelgenix.io` and send replies from it.
**Effort:** ~15 minutes, mostly clicking. No code.

---

## What this enables

The desk connects to the **one `help@travelgenix.io` mailbox** through the Gmail API:

- it **reads** new incoming mail (to turn each into a ticket), and
- it **sends** replies back out from the same address.

That's the whole footprint. It is **least-privilege**: read + send only. The app
**cannot** delete, modify, archive, or label mail, and has **no access to any
other mailbox** in the Workspace.

## How it authenticates

Standard **OAuth 2.0 refresh-token flow**, authorised once against the
`help@travelgenix.io` mailbox. You create a Google Cloud OAuth client and authorise it as `help@travelgenix.io`;
that produces **three secret values** we drop into the app's hosting. The token
is bound to that one mailbox and is revocable at any time.

> ⚠️ Please use **this** OAuth flow — **not** a service account / domain-wide
> delegation. The app is built specifically for the refresh-token flow.

## What we need back from you (3 secret values)

The mailbox is confirmed: **`help@travelgenix.io`**. We need the three OAuth values:

| Value | Looks like |
|---|---|
| **Client ID** | `…apps.googleusercontent.com` |
| **Client secret** | `GOCSPX-…` |
| **Refresh token** | `1//…` |

Send these **securely** (a password manager share / 1Password / not plain email).

---

## Step-by-step (Google Cloud admin)

### 1. Pick/create a Google Cloud project
Use a project in the **Travelgenix Google Cloud organisation** (must be the same
org as the Workspace — that's what lets the consent screen be *Internal* in
step 3). https://console.cloud.google.com → project picker → New project if needed.

### 2. Enable the Gmail API
**APIs & Services → Library → "Gmail API" → Enable.**

### 3. Configure the OAuth consent screen
**APIs & Services → OAuth consent screen.**
- **User type: `Internal`** ← this is the one thing that must be right.
  *(With External "Testing" mode, Google expires the refresh token after 7 days
  and the channel would silently die. `Internal` tokens don't expire that way.)*
- App name e.g. `TG Support Desk`; user-support email; developer email. Save.

### 4. Create the OAuth client credentials
**APIs & Services → Credentials → Create credentials → OAuth client ID.**
- Application type: **Web application**.
- Under **Authorised redirect URIs**, add exactly:
  `https://developers.google.com/oauthplayground`
- Create → copy the **Client ID** and **Client secret**. *(Values 1 and 2.)*

### 5. Mint the refresh token (Google's OAuth Playground — no code)
1. In a browser **signed in as `help@travelgenix.io`** (an incognito window is
   easiest), go to **https://developers.google.com/oauthplayground**.
2. Click the **gear icon** (top-right) → tick **"Use your own OAuth credentials"**
   → paste the **Client ID** and **Client secret** from step 4.
3. In the left **"Input your own scopes"** box, paste these two scopes
   (space-separated) and click **Authorize APIs**:
   ```
   https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send
   ```
4. Choose the **`help@travelgenix.io`** account → **Allow**.
5. Back in the Playground, click **"Exchange authorization code for tokens"**.
6. Copy the **Refresh token** (starts `1//…`). *(Value 3.)*

> If no refresh token comes back, a prior consent already exists: revoke it at
> **myaccount.google.com → Security → Your connections to third-party apps**, then
> redo step 5.

### 6. Hand the four items back
Client ID, Client secret, and Refresh token (the `help@travelgenix.io` address is
already confirmed) — shared securely. We do the rest.

---

## Good to know (for the admin)

- **Scopes are minimal:** `gmail.readonly` + `gmail.send`. No delete/modify.
- **Revocable instantly:** at `myaccount.google.com` (Security → third-party
  access) or by deleting the OAuth client in Cloud Console — either kills access.
- **Mailbox stays normal:** the desk doesn't mark mail read or move it; you can
  still use the inbox as usual.
- **If your Workspace locks down third-party API access** (Admin console →
  Security → API controls → App access control): because this is a *first-party
  Internal* app in your own Cloud project it's generally covered, but you may need
  to add its Client ID as **Trusted**.
- **Deliverability:** so replies from `help@travelgenix.io` don't land in spam,
  make sure `travelgenix.io` has SPF + DKIM set up for Google Workspace (Admin
  console → Apps → Google Workspace → Gmail → Authenticate email). Sending goes
  through Google, so this is the same setup as normal Workspace mail.

---

## What we do on our side (no admin action)

1. Put `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and
   `SUPPORT_EMAIL` into the app's environment (Vercel, Production) and redeploy.
2. The mail poller (already scheduled, runs every minute) starts threading
   incoming mail into tickets; the agent notification + digest emails wake up too.
3. We keep the AI in **shadow mode** (it drafts replies into an internal note for
   a human to review) until you've watched it for a bit and are happy to let it
   reply to customers directly.

Until these values are in place the whole email path stays dormant — nothing
sends, nothing breaks.
