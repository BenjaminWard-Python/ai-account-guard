# AI Account Guard privacy policy

*Last updated: September 30, 2026*

AI Account Guard is a browser extension that keeps people on work accounts when they sign in
to AI services. It is published by StratIT Solutions LLC ("StratIT") and is open source, so everything below
can be checked in the code.

## The short version

AI Account Guard reads a small amount of information inside your browser to do its job, listed
below. It does not save, sell, or send your personal data anywhere. It has no analytics, no
tracking, and no servers. Everything it does happens inside your browser.

## What the extension reads, and why

- **Email addresses typed into sign-in forms** on the AI services it covers (such as ChatGPT,
  Claude, and Perplexity). The extension checks the part after the "@" against your
  organization's approved domains, then discards it. Email addresses are never saved or sent.
- **Clicks and Enter key presses on those services**, so a sign-in can be checked before it is
  sent. The extension does not record what you type or where you click.
- **The label of the sign-in button you click** on those services (for example "Continue with
  Apple"), to decide whether that sign-in method is allowed.
- **The address of each page that opens in a tab**, to tell whether the tab is on a covered AI
  service or part of an AI sign-in. The extension checks every page address as it loads, but it
  keeps nothing about sites that are not AI services or sign-in pages. It only remembers which
  open tabs are part of an AI sign-in (see below), and it never sends your browsing anywhere.

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

## Chrome Web Store User Data Policy

The use of information received from AI Account Guard adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies),
including the [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
requirements. In particular:

- Information is used only to decide whether a sign-in on an AI service is allowed, which is the
  extension's single purpose.
- Information is never transferred to StratIT or anyone else.
- Information is never used for advertising, and it is never sold.
- No person, at StratIT or elsewhere, can read your information, because it never leaves your
  browser.

## Your organization's role

If your organization installed this extension, your IT administrator controls its settings. The
extension does not report anything back to your organization.

## Contact

Questions about this policy: [support@stratitsolutions.com](mailto:support@stratitsolutions.com)
