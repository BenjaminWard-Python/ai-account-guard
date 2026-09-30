# Getting started with AI Account Guard

AI Account Guard keeps staff on **work accounts** when they use ChatGPT, Claude, Gemini,
Copilot, and other AI services in Chrome. Sign-ins with personal email addresses or personal
"Sign in with …" accounts are stopped, and users are pointed to your company sign-in instead.
It's free and open source (MIT).

This guide takes about 15 minutes: try it on one computer, then roll it out.

## 1. Get the extension

- **Chrome Web Store** (recommended): [AI Account Guard](https://chromewebstore.google.com/detail/jhhgomolhbopcedgcnilbggglnfikmfd). Use this for company-wide
  rollout; it keeps everyone updated automatically. The extension ID is `jhhgomolhbopcedgcnilbggglnfikmfd`.
- **From source:** on the GitHub page, click **Code → Download ZIP** and unzip it, or run
  `git clone https://github.com/BenjaminWard-Python/ai-account-guard.git`.

## 2. Try it on one computer

1. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `extension` folder from the download.
3. The settings page opens. Enter your organization's email domain (e.g. `yourorg.org`),
   and optionally your organization name and sign-in portal URL. Click **Save**.
4. Go to chatgpt.com or claude.ai and start signing in with a personal address (like Gmail).
   You should see a notice blocking it. Your work address should go through normally.

> Nothing works until a domain is set: an unconfigured extension blocks every sign-in and
> says it isn't set up yet. If "Load unpacked" is greyed out, your organization's Chrome
> policy blocks developer mode; use a test machine or the Web Store version.

## 3. Roll it out to your organization

Push the extension and its settings from the tool you already use. Ready-made templates
are in the [`deploy`](../deploy/) folder, with step-by-step instructions in
[`deploy/README.md`](../deploy/README.md):

| You manage devices with | Use |
|---|---|
| Microsoft Intune (Windows) | `deploy/intune/Set-AIAccountGuardPolicy.ps1` (platform script) |
| Jamf Pro (macOS) | `deploy/jamf/ai-account-guard.mobileconfig` (configuration profile) |
| Google Workspace (Chromebooks, managed Chrome) | `deploy/google-admin/extension-policy.json` (Admin console) |

The templates already contain the extension ID. Edit the example values. When installed this way, users can't remove the extension or change
its settings.

## 4. Choose your settings

The ones most organizations set:

- **AllowedDomains**: your email domain(s). Required.
- **OrganizationName** and **SupportMessage**: shown to users when something is blocked.
- **SsoPortalUrl**: where "Go to company sign-in" sends people (e.g. `https://myapps.microsoft.com`).
- **Microsoft 365 shops**: set `AllowMicrosoftSignIn` to true and add your `MicrosoftTenantId`
  (Entra admin center → Overview) so "Sign in with Microsoft" works for work accounts only.
- **Google Workspace shops**: "Sign in with Google" is allowed for your domain by default.
- **ProviderModes**: block a service outright, e.g. `{"deepseek": "block"}`.
- **SignOutOnInstall**: set to true for the first rollout to end existing personal sessions.

The full list is in the [README](../README.md#configuration).

## 5. Check it's working

On a managed computer, open `chrome://policy`, click **Reload policies**, and find the
extension's section: your values should be listed with no errors. Then repeat the personal
sign-in test from step 2.

## Know the limits

It protects **managed Chrome** only. Block other browsers and desktop AI apps with your MDM.
It checks which account signs in, not what gets typed. And a work email on a free AI plan is
still a personal plan, so pair this with your AI vendor's business or enterprise account
controls where you can.
