<#
.SYNOPSIS
  Force-installs AI Account Guard in Google Chrome and/or Microsoft Edge and writes its
  settings (Windows).

.DESCRIPTION
  Deploy with Intune: Devices > Scripts and remediations > Platform scripts, run as SYSTEM,
  64-bit PowerShell. Safe to re-run; it replaces the extension's settings each time and
  leaves other force-installed extensions alone. The browsers pick up changes within a few
  minutes, or immediately via chrome://policy or edge://policy > Reload policies.

  Edit the values in the CONFIGURATION section, then upload. Or make a filled-in copy at
  https://stratitsolutions.com/ai-account-guard/setup/
#>

# ---- CONFIGURATION -----------------------------------------------------------------------
$ExtensionId = 'jhhgomolhbopcedgcnilbggglnfikmfd'    # Chrome Web Store ID of AI Account Guard
$UpdateUrl   = 'https://clients2.google.com/service/update2/crx'

# Browsers to set up. Microsoft Edge installs the extension from the Chrome Web Store too.
$Browsers = @('Chrome', 'Edge')

# Turn off incognito/InPrivate and guest windows, where extensions don't run.
$BlockPrivateBrowsing = $true

$Policy = [ordered]@{
  AllowedDomains         = @('example.org')
  OrganizationName       = 'Example Org'
  SsoPortalUrl           = 'https://myapps.microsoft.com'
  SupportMessage         = 'Questions? Contact IT.'
  AllowGoogleSignIn      = $false
  AllowMicrosoftSignIn   = $true
  MicrosoftTenantId      = '00000000-0000-0000-0000-000000000000'
  TenantRestrictionScope = 'ai-sites'
  ProviderModes          = [ordered]@{ deepseek = 'block' }
  SignOutOnInstall       = $true
}
# ------------------------------------------------------------------------------------------

$ErrorActionPreference = "Stop"

$Roots = @{ Chrome = "HKLM:\SOFTWARE\Policies\Google\Chrome"; Edge = "HKLM:\SOFTWARE\Policies\Microsoft\Edge" }
$PrivatePolicy = @{ Chrome = "IncognitoModeAvailability"; Edge = "InPrivateModeAvailability" }

# Creates a registry key only if it's missing. (New-Item -Force on an existing key would
# recreate it and wipe its values, such as other extensions on the force-install list.)
function Ensure-Key($path) {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
}

foreach ($browser in $Browsers) {
  $root = $Roots[$browser]
  Ensure-Key $root

  # 1. Force-install the extension (adds to the list without disturbing other entries).
  $forceKey = Join-Path $root "ExtensionInstallForcelist"
  Ensure-Key $forceKey
  $entry = "$ExtensionId;$UpdateUrl"
  $existing = (Get-Item $forceKey).Property | ForEach-Object { (Get-ItemProperty $forceKey).$_ }
  if ($existing -notcontains $entry) {
    $next = 1
    while ((Get-Item $forceKey).Property -contains "$next") { $next++ }
    New-ItemProperty -Path $forceKey -Name "$next" -Value $entry -PropertyType String -Force | Out-Null
  }

  # 2. Write the extension settings. Lists and objects become subkeys; booleans become DWORDs.
  $policyKey = Join-Path $root "3rdparty\extensions\$ExtensionId\policy"
  if (Test-Path $policyKey) { Remove-Item $policyKey -Recurse -Force }
  New-Item -Path $policyKey -Force | Out-Null

  foreach ($name in $Policy.Keys) {
    $value = $Policy[$name]
    if ($value -is [bool]) {
      New-ItemProperty -Path $policyKey -Name $name -Value ([int]$value) -PropertyType DWord | Out-Null
    } elseif ($value -is [System.Collections.IDictionary]) {
      $sub = New-Item -Path (Join-Path $policyKey $name) -Force
      foreach ($k in $value.Keys) {
        New-ItemProperty -Path $sub.PSPath -Name $k -Value ([string]$value[$k]) -PropertyType String | Out-Null
      }
    } elseif ($value -is [array]) {
      $sub = New-Item -Path (Join-Path $policyKey $name) -Force
      for ($i = 0; $i -lt $value.Count; $i++) {
        New-ItemProperty -Path $sub.PSPath -Name "$($i + 1)" -Value ([string]$value[$i]) -PropertyType String | Out-Null
      }
    } else {
      New-ItemProperty -Path $policyKey -Name $name -Value ([string]$value) -PropertyType String | Out-Null
    }
  }

  # 3. Private browsing: extensions don't run in incognito/InPrivate or guest windows.
  if ($BlockPrivateBrowsing) {
    New-ItemProperty -Path $root -Name $PrivatePolicy[$browser] -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -Path $root -Name "BrowserGuestModeEnabled" -Value 0 -PropertyType DWord -Force | Out-Null
  }

  Write-Output "AI Account Guard set up in $browser"
}
