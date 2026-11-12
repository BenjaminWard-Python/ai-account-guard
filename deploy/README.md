# Deploying AI Account Guard

**Quickest:** the [setup page](https://stratitsolutions.com/ai-account-guard/setup/) builds a ready-to-deploy file
for Jamf, Intune or the Google Admin console from a few answers, and looks up your Microsoft
tenant ID for you. The templates below are the same files, for editing by hand.

Every method does two things: **force-install** the extension, and push its **policy**
(the settings in the main README). The templates already contain the extension's Chrome Web
Store ID, `jhhgomolhbopcedgcnilbggglnfikmfd`; edit the example values for your organization.

After deploying, confirm on a managed machine at `chrome://policy` (click **Reload policies**):
there should be a section for `jhhgomolhbopcedgcnilbggglnfikmfd` with your values and no errors.
If that section is missing, the settings didn't arrive; installing the extension alone doesn't
send them. The extension's settings page should say the settings are managed by your
organization. Also check
`chrome://extensions` to confirm the extension is installed and can't be removed.

## Microsoft Intune (Windows)

Use [intune/Set-AIAccountGuardPolicy.ps1](intune/Set-AIAccountGuardPolicy.ps1):

1. Edit the **CONFIGURATION** section at the top.
2. Intune admin center → **Devices → Scripts and remediations → Platform scripts → Add → Windows 10 and later**.
3. Upload the script. Set **Run this script using the logged on credentials** = *No*,
   **Run script in 64 bit PowerShell Host** = *Yes*.
4. Assign to your device group.

The script writes to `HKLM\SOFTWARE\Policies\Google\Chrome` and
`HKLM\SOFTWARE\Policies\Microsoft\Edge` (set `$Browsers` to the ones you use). It's safe to
re-run: rerunning it replaces the extension's settings and leaves other force-installed
extensions alone. It's tested on Windows in
[.github/workflows/intune-script.yml](../.github/workflows/intune-script.yml).

## Active Directory Group Policy (Windows)

Use the administrative template in [group-policy/](group-policy/): `AIAccountGuard.admx`, with
`en-US` and `nl-NL` language files. It puts every setting in the Group Policy Editor under
**Computer Configuration → Policies → Administrative Templates → AI Account Guard**, with a
folder each for **Google Chrome** and **Microsoft Edge**. Each service mode (ChatGPT, Claude,
Gemini…) is its own setting in the browser's **AI services** folder.

The template sets the extension's settings only. Force-install the extension as you already do
for other extensions, for example with Chrome's and Edge's own templates
(**Configure the list of force-installed apps and extensions**), using
`jhhgomolhbopcedgcnilbggglnfikmfd;https://clients2.google.com/service/update2/crx` for both
browsers.

1. Copy `AIAccountGuard.admx` to the central store,
   `\\<domain>\SYSVOL\<domain>\Policies\PolicyDefinitions\`, and each language folder's
   `AIAccountGuard.adml` to the folder of the same name there (`en-US\`, `nl-NL\`). Always copy
   `en-US`: the editor falls back to it. Without a central store, use
   `C:\Windows\PolicyDefinitions\` on the machine where you edit policies.
2. Open (or create) a GPO linked to your computers, then go to **Computer Configuration →
   Policies → Administrative Templates → AI Account Guard → Google Chrome** (and **Microsoft
   Edge**). Configure at least **Allowed email domains**.
3. Run `gpupdate /force` on a test machine and check `chrome://policy` and `edge://policy`
   (click **Reload policies**).

Each setting writes the same registry values as the Intune script, under
`HKLM\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\jhhgomolhbopcedgcnilbggglnfikmfd\policy`
for Chrome and the matching `Microsoft\Edge` path for Edge:

| Setting | Registry value |
|---|---|
| `OrganizationName`, `SsoPortalUrl`, `SupportMessage`, `MicrosoftTenantId`, `TenantRestrictionScope` | REG_SZ value |
| `AllowGoogleSignIn`, `AllowMicrosoftSignIn`, `SignOutOnInstall` | REG_DWORD value, 1 or 0 |
| `AllowedDomains` | subkey `AllowedDomains` with REG_SZ values named `1`, `2`, `3`… |
| `ProviderModes` | subkey `ProviderModes` with a REG_SZ value per service ID (`chatgpt`, `claude`…): `enforce`, `block` or `off` |

Disabling or not configuring a setting leaves the extension's default (see the main README),
except the three on/off settings, where **Disabled** writes 0.

The template is generated from the extension's settings schema by
[scripts/build-group-policy.py](../scripts/build-group-policy.py); don't edit it by hand.
[test/check_group_policy.py](../test/check_group_policy.py) checks it against Microsoft's ADMX
schema and against the extension's settings, in
[.github/workflows/group-policy.yml](../.github/workflows/group-policy.yml).

## Jamf Pro (macOS)

Use [jamf/ai-account-guard.mobileconfig](jamf/ai-account-guard.mobileconfig):

1. Edit the policy values.
2. Jamf Pro → **Computers → Configuration Profiles → Upload**, and scope it to your computers.

The profile has two payloads: `com.google.Chrome` (force install) and
`com.google.Chrome.extensions.jhhgomolhbopcedgcnilbggglnfikmfd` (extension policy).

**Already installing it another way** (for example from the Chrome Web Store link)? Don't add a
second force-install; push only the settings with
[jamf/ai-account-guard-settings.plist](jamf/ai-account-guard-settings.plist):

1. Edit the values in the file.
2. Jamf Pro → **Computers → Configuration Profiles** → the profile that installs the extension
   (or a new one with the same scope) → **Application & Custom Settings → Upload**.
3. **Preference Domain:** `com.google.Chrome.extensions.jhhgomolhbopcedgcnilbggglnfikmfd`.
   Upload the plist and save.

Installing the extension without its settings is not enough: from version 0.1.3 the extension
blocks every sign-in on AI services and tells users IT is still setting it up, until the
settings arrive. (Earlier versions let users edit the settings themselves in that case.)

## Google Workspace (Admin console)

The Admin console manages Chrome (not Edge). Chromebooks are covered automatically. On Windows
and Macs it only reaches Chrome that is **enrolled in Chrome Enterprise Core** (free with
Google Workspace); enrolled Chrome gets the settings in every profile. Without enrollment, the
settings reach only staff signed in to Chrome with their work account, in that profile alone.

**Enroll Chrome** (once per computer):

1. Admin console → **Chrome browser → Managed browsers → Enroll (+)**, and copy the enrollment
   token for your staff's org unit.
2. Put the token on each computer, then quit and reopen Chrome:
   - Windows (Command Prompt as administrator):
     `reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v CloudManagementEnrollmentToken /t REG_SZ /d <token> /f`
   - Mac (Terminal):
     `sudo mkdir -p "/Library/Google/Chrome" && printf %s "<token>" | sudo tee "/Library/Google/Chrome/CloudManagementEnrollmentToken" > /dev/null`
3. `chrome://management` should say the browser is managed, and it appears under **Managed browsers**.

**Install and configure the extension:**

1. Admin console → **Chrome browser → Apps & extensions → Managed browsers** (or **Users &
   browsers** if you aren't enrolling browsers). Select the org unit.
2. **+ → Add Chrome app or extension by ID**, enter `jhhgomolhbopcedgcnilbggglnfikmfd`, and set
   **Installation policy** = *Force install*.
3. In the extension's **Policy for extensions** box, paste
   [google-admin/extension-policy.json](google-admin/extension-policy.json) after editing it, or
   the settings the [setup page](https://stratitsolutions.com/ai-account-guard/setup/) builds.

## Microsoft Edge

Edge installs AI Account Guard from the Chrome Web Store with the same extension ID and update
URL, but reads its own policies: `HKLM\SOFTWARE\Policies\Microsoft\Edge` on Windows and the
`com.microsoft.Edge` / `com.microsoft.Edge.extensions.jhhgomolhbopcedgcnilbggglnfikmfd`
preference domains on macOS. The Intune script and Jamf profile set up both browsers; the
Google Admin console manages Chrome only. Check Edge at `edge://policy`.

## Private browsing

Extensions don't run in incognito (Chrome), InPrivate (Edge) or guest windows, and no policy
can force them on there, so a sign-in in one of those windows isn't checked. Turn them off:

| | Chrome | Edge |
|---|---|---|
| Private windows | `IncognitoModeAvailability` = 1 | `InPrivateModeAvailability` = 1 |
| Guest windows | `BrowserGuestModeEnabled` = false | `BrowserGuestModeEnabled` = false |

The Intune script (`$BlockPrivateBrowsing`), the Jamf profile and the setup page include these
by default. In the Google Admin console, set **Incognito mode** and **Browser guest mode** in the
org unit's Chrome browser settings.

## Recommended pairings

- Block or remove other browsers through your MDM, so Chrome and Edge are the only ways to reach these services.
- Turn on `SignOutOnInstall` for the first rollout so pre-existing personal sessions end.
- If you use Microsoft 365, set `AllowMicrosoftSignIn` + `MicrosoftTenantId` and point
  `SsoPortalUrl` at `https://myapps.microsoft.com`.
