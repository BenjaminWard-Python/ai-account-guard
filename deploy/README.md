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

The script writes to `HKLM\SOFTWARE\Policies\Google\Chrome`. It's safe to re-run, and
rerunning it replaces the extension's policy.

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

1. Admin console → **Chrome browser → Apps & extensions → Users & browsers** (or
   **Managed browsers**). Select the org unit.
2. **+ → Add Chrome app or extension by ID**, enter `jhhgomolhbopcedgcnilbggglnfikmfd`, and set
   **Installation policy** = *Force install*.
3. In the extension's **Policy for extensions** box, paste
   [google-admin/extension-policy.json](google-admin/extension-policy.json) after editing it.

This works for Chromebooks and for Chrome browsers enrolled in Chrome Browser Cloud Management.

## Recommended pairings

- Block or remove other browsers through your MDM, so Chrome is the only way to reach these services.
- Turn on `SignOutOnInstall` for the first rollout so pre-existing personal sessions end.
- If you use Microsoft 365, set `AllowMicrosoftSignIn` + `MicrosoftTenantId` and point
  `SsoPortalUrl` at `https://myapps.microsoft.com`.
