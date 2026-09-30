# Deploying AI Account Guard

Every method does two things: **force-install** the extension, and push its **policy**
(the settings in the main README). The templates already contain the extension's Chrome Web
Store ID, `jhhgomolhbopcedgcnilbggglnfikmfd`; edit the example values for your organization.

After deploying, confirm on a managed machine at `chrome://policy`: the extension ID should
appear under the extension's section with your values and no errors. Also check
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
