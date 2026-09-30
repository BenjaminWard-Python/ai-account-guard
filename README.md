# AI Account Guard

A Chrome extension that keeps staff on **work accounts** when they use AI services.
Sign-ins with personal email addresses and personal "Sign in with …" accounts are stopped
on ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, Grok, Mistral, Poe, and Meta AI.
Instead, users are pointed to the company sign-in portal.

Built for small organizations (nonprofits, local government, small businesses) that need
this control without an enterprise browser or SSE platform. IT configures it centrally
through Intune, Jamf, or the Google Admin console.

**New here? Start with the [Getting started guide](docs/GETTING_STARTED.md).**

## How it works

| Layer | What it does |
|---|---|
| **Email check** (content script) | On each AI service's login page, checks the email typed into the sign-in form. If the domain isn't in `AllowedDomains`, the submit/continue action is stopped before the page sees it, and a notice explains why. It works on page structure (email fields, buttons, Enter key, shadow DOM) rather than per-site selectors, so it survives most login-page redesigns. |
| **Sign-in button check** (content script) | Recognizes "Continue with Google / Microsoft / Apple / GitHub / X / phone…" buttons. Google and Microsoft are allowed only when configured (see below); the rest are always blocked. "Continue with SSO" buttons are allowed, since they lead to the email check or your IdP. |
| **Network backstop** (declarativeNetRequest) | If a disallowed sign-in navigation starts from an AI service anyway (redirects, popups), it's redirected to a block page. Services set to `block` are blocked entirely. |
| **Google/Microsoft tenant restrictions** | For allowed Google/Microsoft sign-in, the extension adds the vendors' own tenant-restriction headers (`X-GoogApps-Allowed-Domains`; `Restrict-Access-To-Tenants` / `Restrict-Access-Context`). Google and Microsoft then refuse any account outside your domains/tenant. Personal Microsoft accounts (login.live.com) are always blocked from AI services. |

By default, tenant restrictions only apply to sign-ins that **start from an AI service**
(the AI tab and sign-in popups it opens), so staff can still use personal Gmail elsewhere.
Set `TenantRestrictionScope` to `all-browsing` to apply them browser-wide.

## Configuration

IT pushes these as extension policy (see [deploy/](deploy/)). Without managed policy, the
settings page (click the toolbar icon) can be used instead. When any managed policy is present,
the settings page is read-only.

| Key | Type | Default | Description |
|---|---|---|---|
| `AllowedDomains` | list | *(empty)* | Email domains allowed to sign in. `*.example.org` also allows subdomains. **Must be set**: until it is, every sign-in on covered services is blocked. |
| `OrganizationName` | string | | Shown in block messages. |
| `SsoPortalUrl` | string | | Company sign-in portal; shown as "Go to company sign-in". |
| `SupportMessage` | string | | Extra text on block messages (e.g. how to reach IT). |
| `AllowGoogleSignIn` | bool | `true` | Allow Sign in with Google, restricted to Workspace accounts in `AllowedDomains`. |
| `AllowMicrosoftSignIn` | bool | `false` | Allow Sign in with Microsoft, restricted to your tenant. Requires `MicrosoftTenantId`. |
| `MicrosoftTenantId` | string | | Entra directory (tenant) ID. |
| `TenantRestrictionScope` | `ai-sites` \| `all-browsing` | `ai-sites` | Where the Google/Microsoft restrictions apply. |
| `ProviderModes` | object | | Per service: `enforce` (work accounts only), `block`, or `off`. IDs: `chatgpt`, `claude`, `gemini`, `copilot`, `perplexity`, `deepseek`, `grok`, `mistral`, `poe`, `meta`. Meta AI defaults to `block` (it only supports personal accounts). |
| `SignOutOnInstall` | bool | `false` | On first install, clear cookies/site data for covered services so existing personal sessions end. Gemini and Copilot are skipped (their cookies are shared with all of Google/Microsoft). |

## Try it locally

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select
   the `extension/` folder.
2. The settings page opens on install (or click the toolbar icon). Add your organization's
   email domain and save.
3. Visit chatgpt.com or claude.ai, start signing in with a personal address, and confirm the notice.

To test managed policy on a Mac without Jamf, install the profile from
[deploy/jamf/](deploy/jamf/) with your unpacked extension's ID, then check `chrome://policy`.

## Tests

The logic is plain JavaScript and the tests run in any browser:

```bash
python3 -m http.server 8765 --directory .
```

Then open http://127.0.0.1:8765/test/unit.html (config and network rules) and
http://127.0.0.1:8765/test/content.html (sign-in blocking against simulated login forms).

## Known limitations

- **Managed Chrome only.** Other browsers, mobile apps, and desktop AI apps are not covered.
  Block other browsers with your MDM, and block the ChatGPT/Claude desktop apps if needed.
- **Logged-out use** (e.g. ChatGPT without an account) is not blocked. Set a service to `block`
  if that matters.
- **Existing sessions** survive install unless `SignOutOnInstall` is on.
- **A work email is not a company workspace.** Someone can still create a free account with
  their work address. Pair this with each AI vendor's domain verification / enterprise
  account claiming where available.
- **Passkey sign-in** can't be checked (no email is entered).
- AI login pages change. The generic approach handles most redesigns, but the service list and
  button patterns in [extension/shared/providers.js](extension/shared/providers.js) need upkeep.

## Layout

```
extension/            The Chrome extension (load this folder)
  manifest.json
  schema.json         Managed policy schema
  background.js       Keeps network rules in sync with policy; tracks AI sign-in tabs
  content/content.js  On-page email and sign-in button checks
  shared/             Service catalog, config handling, rule builder (shared by all parts)
  pages/              Block page and settings page
deploy/               Intune, Jamf, and Google Admin templates
test/                 In-browser tests
```

## Privacy

No data collection, no servers, no analytics. See the [privacy policy](docs/PRIVACY.md).

## License

[MIT](LICENSE)
