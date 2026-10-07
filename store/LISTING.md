# Chrome Web Store submission kit

Everything to paste into the Chrome Web Store Developer Dashboard for AI Account Guard.
Build the upload with `./scripts/package.sh` (creates `dist/ai-account-guard-<version>.zip`).

## Before you submit

- [ ] Developer account registered ($5), 2-step verification on, contact email verified
- [ ] Trader declaration completed (business name, address, phone)
- [ ] [store/privacy-policy.html](privacy-policy.html) published at
      https://stratitsolutions.com/ai-account-guard/privacy/ and opens without a login
- [ ] support@stratitsolutions.com is monitored
- [ ] Visibility chosen: **Unlisted** for the pilot, then Public

## Store listing tab

Name at most two AI services anywhere in the listing (summary, description, screenshots).
Version 0.1.0 was rejected as keyword spam ("Yellow Argon") for listing nine service names
in the description. The full list lives on the settings page and in the docs instead.

The description points to the GitHub repo, so keep the repo public; a reviewer who follows the
link to a private repo gets a 404.

**Name:** AI Account Guard

**Summary** (max 132 characters):

> Keeps staff on work accounts in ChatGPT, Claude and other AI services by blocking personal sign-ins.

This is the `description` in `extension/manifest.json`; the store shows it as the summary, so keep
the two identical.

**Category:** Productivity → Tools
**Language:** English

**Description:**

```
AI Account Guard keeps your staff on work accounts when they use AI services in Chrome.

Personal accounts on AI tools are a quiet data-loss risk: work documents pasted into a personal ChatGPT or Claude account leave your organization's control. AI Account Guard stops those sign-ins before they happen and points people to your company sign-in instead.

WHAT IT DOES
• Blocks sign-in with personal email addresses on popular AI chat services. The settings page lists every service covered.
• Blocks personal "Continue with …" sign-in buttons, such as Continue with Apple, on those services
• Allows "Sign in with Google" and "Sign in with Microsoft" for your organization's accounts only, using Google's and Microsoft's own tenant restrictions
• Lets you block individual AI services entirely. Services that only offer personal accounts are blocked by default.
• Shows a clear message with your organization's name, support contact and a link to your sign-in portal

BUILT FOR IT TEAMS
• Configure centrally with Microsoft Intune, Jamf, or the Google Admin console. Users can't remove it or change its settings.
• Ready-made deployment templates and a step-by-step guide are in the project's GitHub repository
• Smaller teams without device management can configure it on each computer from its settings page

PRIVATE BY DESIGN
• No accounts, no servers, no analytics, no tracking
• Email addresses are checked inside the browser and never stored or sent
• Free and open source (MIT license). Read the code on GitHub.

Important: this extension must be configured before use. Until an approved email domain is set, it blocks every sign-in on the AI services it covers.

It protects Chrome only. For full coverage, also block other browsers and desktop AI apps with your device management tools.
```

**Graphics** (in [store/assets/](assets/)):

| Asset | File |
|---|---|
| Store icon (128×128) | `store/assets/store-icon-128.png` (96×96 artwork with 16px transparent padding, per Google's icon guidelines; source `store/assets/src/store-icon.svg`) |
| Screenshot 1 | `store/assets/screenshot-1-block.png` |
| Screenshot 2 | `store/assets/screenshot-2-settings.png` |
| Screenshot 3 | `store/assets/screenshot-3-sso.png` |
| Small promo tile (440×280) | `store/assets/promo-small-440x280.png` |

**Homepage URL:** https://github.com/BenjaminWard-Python/ai-account-guard
**Support URL:** optional. Your verified contact email (support@stratitsolutions.com) is shown on
the listing either way; add a StratIT support page here later if you make one.

## Test instructions tab (Access)

Reviewers install the extension unconfigured, which blocks every sign-in on the covered AI
services. Paste this so they can see both outcomes:

```
This extension is configured by an organization's IT team, so until an approved email domain is set it blocks every sign-in on the AI services it covers.

To test:
1. After installing, the settings page opens (or click the extension's toolbar icon).
2. Under "Allowed email domains", enter: example.org
3. Click Save.
4. Go to https://chatgpt.com/auth/login and enter a personal address such as someone@gmail.com, then click Continue. A notice explains that personal accounts aren't allowed, and the sign-in is stopped.
5. Enter someone@example.org and click Continue. The sign-in proceeds normally.
6. Click "Continue with Apple". It is blocked. "Continue with Google" is allowed, restricted to example.org accounts by Google's own tenant restriction.

No account or login is needed to test. The extension has no servers and sends no data.
```

## Privacy practices tab

**Single purpose:**

> Restricts sign-ins on AI services to accounts from the organization's approved email domains, blocking personal accounts.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Reads the organization's settings pushed by IT through managed policy, saves settings entered on the settings page, and keeps a temporary list of tabs that are part of an AI sign-in. |
| `declarativeNetRequest` | Blocks sign-in pages for personal identity providers (e.g. Apple, personal Microsoft accounts) when the sign-in starts from an AI service, blocks AI services the administrator has disabled, and adds Google's and Microsoft's tenant-restriction headers so only the organization's accounts can sign in. |
| `webNavigation` | Detects when a tab is on an AI service, or is a sign-in popup opened by one, so restrictions apply only to AI sign-ins and not to the user's other browsing. |
| `browsingData` | Optional administrator setting that clears cookies and site data for the covered AI services when the extension is installed, ending personal sessions that existed before rollout. Not used unless the administrator turns it on. |
| Host permissions | AI service domains: to check the email address entered in their sign-in forms. Sign-in provider domains (Google, Microsoft, Apple, GitHub, Facebook, X, Discord, WeChat): to block or apply tenant restrictions to sign-ins started from those AI services. The extension does not request access to all websites. |

**Remote code:** No, I am not using remote code.

**Data usage:** Google counts data handled only on the device, so declare it (User Data FAQ #3).
Tick these, and keep them in step with [docs/PRIVACY.md](../docs/PRIVACY.md):

| Category | Why |
|---|---|
| Personally identifiable information | Reads email addresses typed into sign-in forms on covered AI services |
| Web history | Checks the address of each page that loads in a tab, to tag AI sign-in tabs |
| User activity | Listens for clicks and Enter key presses on covered AI services to stop a sign-in |
| Website content | Reads sign-in button labels (e.g. "Continue with Apple") to classify them |

Leave the other categories unticked, and certify all three statements (no selling, no unrelated
use, no creditworthiness use). A mismatch between these boxes, the privacy policy and the code
can get the whole publisher account suspended, so update all three together.

**Privacy policy URL:** https://stratitsolutions.com/ai-account-guard/privacy/

Published from the stratit-website repo at `ai-account-guard/privacy/index.html`, a copy of
[store/privacy-policy.html](privacy-policy.html), which is generated from
[docs/PRIVACY.md](../docs/PRIVACY.md). After editing the policy, run
`python3 scripts/build-privacy-html.py` and copy the result into the website repo.

## Distribution tab

- **Visibility:** Unlisted for the pilot
- **Regions:** All regions

## Extension ID

`jhhgomolhbopcedgcnilbggglnfikmfd` (permanent). It is already filled into [deploy/](../deploy/),
and the store link is in [docs/GETTING_STARTED.md](../docs/GETTING_STARTED.md).

Expect the first review to take longer than usual: the extension reads sign-in forms and changes
sign-in requests, which gets a closer look. The permission justifications above are written for
that reviewer.

## Regenerating screenshots

Run `./scripts/render-store-assets.sh` (macOS, needs Google Chrome). It renders the real
extension pages with the demo settings in `store/assets/src/mock-chrome.js`.
