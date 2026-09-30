# AI Account Guard privacy policy

*Last updated: September 30, 2026*

AI Account Guard is a browser extension that keeps people on work accounts when they sign in
to AI services. It is published by StratIT Solutions LLC ("StratIT") and is open source, so everything below
can be checked in the code.

## The short version

AI Account Guard does not collect, store, sell, or send your personal data anywhere. It has no
analytics, no tracking, and no servers. Everything it does happens inside your browser.

## What the extension reads, and why

- **Email addresses typed into sign-in forms** on the AI services it covers (such as ChatGPT,
  Claude, and Perplexity). The extension checks the part after the "@" against your
  organization's approved domains, then discards it. Email addresses are never saved or sent.
- **Which sign-in button you click** on those services (for example "Continue with Apple"), to
  decide whether that sign-in method is allowed.
- **The address of pages you open in a tab that started on a covered AI service**, only to tell
  whether the tab is still part of an AI sign-in. Nothing about your browsing is saved beyond the
  current browser session, and nothing is sent anywhere.

## What the extension stores

- **Settings**, either set by your organization's IT administrator through device management,
  or entered on the extension's settings page. They are stored in your browser only.
- **A list of open tab IDs** that are part of an AI sign-in, kept in temporary browser storage
  and cleared when the browser closes.

## What the extension sends

The extension makes no network requests of its own. When your organization allows "Sign in
with Google" or "Sign in with Microsoft", the extension adds standard tenant-restriction
headers to your browser's requests to Google or Microsoft sign-in pages. These headers contain
your **organization's approved email domains** and, for Microsoft, your **organization's tenant
ID**. They contain nothing about you personally. Google and Microsoft use them to allow only
your organization's accounts.

## Clearing sessions

If your IT administrator turns on the "sign out on install" setting, the extension clears
cookies and site data for the covered AI services when it is first installed. This signs you
out of those services so you can sign back in with your work account. It does not read that
data, and it does not affect other websites.

## Your organization's role

If your organization installed this extension, your IT administrator controls its settings. The
extension does not report anything back to your organization.

## Contact

Questions about this policy: [support@stratitsolutions.com](mailto:support@stratitsolutions.com)
