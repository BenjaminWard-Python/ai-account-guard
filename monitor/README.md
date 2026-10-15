# Daily login-page check

AI services redesign their sign-in pages without warning. This check loads each one's real
sign-in page in Chrome with the extension from `../extension`, and fails if anything would let
a personal sign-in through:

- **Email field:** the page has an email field the extension recognizes, and a personal
  address typed into it is blocked. Nothing is ever sent: any request carrying the test
  address is cancelled.
- **Sign-in buttons:** every "Continue with …" button is one the extension recognizes. A new
  provider (say, "Continue with LinkedIn") would not be blocked, so it fails the check.
- **Page changes:** the sign-in buttons listed in [sites.mjs](sites.mjs) are still there.
- **Blocked sites:** Meta AI is replaced by the extension's block page.

Sites that show a bot check are reported as not checked, never bypassed.

## Running it

```sh
cd monitor
npm install
npm run check                 # all sites
npm run check -- chatgpt poe  # just these
HEADFUL=1 npm run check       # visible browser; sites block headless Chrome more often
```

Results print to the terminal, and `output/` has `report.md` plus a screenshot of each page.

It also runs daily in GitHub Actions ([.github/workflows/login-check.yml](../.github/workflows/login-check.yml)),
which emails the repo owner when it fails. The report is on the run's summary page and the
screenshots are attached to the run. Run it on demand from **Actions → Login page check → Run workflow**.

## When it fails

- **Not blocked / new sign-in button:** fix the recognition rules in
  `extension/shared/providers.js` (or the domains there and in `manifest.json` if a service
  moved), add a test in `test/`, and release a new version.
- **Changed:** the page was redesigned but nothing got through. Check the screenshot and update
  the site's entry in `sites.mjs`.
