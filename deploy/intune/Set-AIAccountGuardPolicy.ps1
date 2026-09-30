<#
.SYNOPSIS
  Force-installs AI Account Guard in Google Chrome and writes its policy (Windows).

.DESCRIPTION
  Deploy with Intune: Devices > Scripts and remediations > Platform scripts, run as SYSTEM,
  64-bit PowerShell. Safe to re-run; it replaces the extension's policy each time.

  Edit the values in the CONFIGURATION section, then upload.
  Chrome picks up changes within a few minutes, or immediately via chrome://policy > Reload.
#>

# ---- CONFIGURATION -----------------------------------------------------------------------
$ExtensionId   = "EXTENSION_ID"    # Chrome Web Store ID of AI Account Guard
$UpdateUrl     = "https://clients2.google.com/service/update2/crx"

$Policy = [ordered]@{
  AllowedDomains         = @("stratitsolutions.com")
  OrganizationName       = "StratIT Solutions"
  SsoPortalUrl           = "https://myapps.microsoft.com"
  SupportMessage         = "Questions? Contact IT."
  AllowGoogleSignIn      = $false
  AllowMicrosoftSignIn   = $true
  MicrosoftTenantId      = "00000000-0000-0000-0000-000000000000"
  TenantRestrictionScope = "ai-sites"
  ProviderModes          = [ordered]@{ deepseek = "block" }
  SignOutOnInstall       = $true
}
# ------------------------------------------------------------------------------------------

$ErrorActionPreference = "Stop"
$chromeKey = "HKLM:\SOFTWARE\Policies\Google\Chrome"

# 1. Force-install the extension (adds to the list without disturbing other entries).
$forceKey = Join-Path $chromeKey "ExtensionInstallForcelist"
New-Item -Path $forceKey -Force | Out-Null
$entry = "$ExtensionId;$UpdateUrl"
$existing = (Get-Item $forceKey).Property | ForEach-Object { (Get-ItemProperty $forceKey).$_ }
if ($existing -notcontains $entry) {
  $next = 1
  while ((Get-Item $forceKey).Property -contains "$next") { $next++ }
  New-ItemProperty -Path $forceKey -Name "$next" -Value $entry -PropertyType String -Force | Out-Null
}

# 2. Write the extension policy. Lists and objects become subkeys; booleans become DWORDs.
$policyKey = Join-Path $chromeKey "3rdparty\extensions\$ExtensionId\policy"
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

Write-Output "AI Account Guard policy written for extension $ExtensionId"
