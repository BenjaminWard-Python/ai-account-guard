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
  OrganizationLogo       = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAEyUlEQVR42u2cPYsUQRCG7x/sL5D7AQYbG21o5kUGRhtovpiabGTqmStcZmCymBkIm2l4IAYiyqGIKCJ7KCKIMF4djizHfezMVHdXVT8Nb3LZVT3dXW91zW5duvZ6C9UrggAABAEAEAAgAEAAgAAAAQACAAQAZ2p8pCUyqXEOACZHapBJTQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABguK7cetvMH3xpnr/8+V8Pn3w7/jsABNe9R1+b85aAcPnGGwCIqMfPDptN1qt3vwAgmuTI77LkJACAILp9/1PTZynXBABQQldnB83hjz+9AJBTAwAqTX6CawAAckoqeSnmhqynL74DgFcNTb4ssYwAENjuXbRu3v0IANEaPZuuD59/YwNrsXunLSkgAcBZxa+1BCQ6gRXZvYSFHwDksHtyX2ssKR55DazM6yd+AAIAD3ZPkp/oCRgAUknatBpLaofEgyCxAJCd0k7TyM4RSctUKucMu0jV7knyE9i9uABIZ+y8aluKsdQBvX7nvXW7FxOALrsuFQSadk/5qTc2AHJHdgl8iqNVrhet5Ce2e/EA6FNwyXWgVRNo2j2pXRgL76i+jRYteyVFpiO7Fw+AkkMVWl5fro+Cya8XgCF3rlO7Fw8AjeKrq+USy6m1lAc76gNA6w7eFAJNu5fZ68cEQKv5sslR3NVyGrR7MRtBOXrvmnZPeaIXAHLYMfHoAexeXABSvr9r2T3NBhQAZGrJdv1w07jdiz8PoFmlax37sqRY5RdCMv1Dms+ywexePRNBmnP4Q1aCb/ndAjDyOpoVxOufp1EOAEQHXoczg9i903TQJ5d9Adjz+jVu0OQ3/3KSDYAd7zP6zu3eadrJCUCRa0DbHpaYObR0/A8FYB7hOz2ndu+k5iUAkIpzFeEz7UwfbqbSqk/1rwFA0VNAs73r0O6p7H4NAIqeAtrf7jlM/qDdrwGAaFo6EEOfkJ3ZvXVNh+ZPAwDR0usn3Bk/3NTWUiN3WgBsl74K+jwhO/T660f/tiUARDNvP+Pi0O61mmnlTRMA0cILBI6Tv9DMmTYAo1IdwpNTv2e5AxkOMT7UcVHHb2QZANG4dD2wXhdIsqW5Ix9uOC321u/9sXa+UgBgwhoG1DRFrlIBULxLGEzzVHlKCUCxuYFg2kuZo9QAmHAGjrVInZ8cAEjVuk8yO2tfu+IvBQAQGE1+TgCAwGDycwMABMaSXwIAIDCU/FIAAIGR5JcEgD5BJp9vHYDaIdgrHX8LAJiYJfD8ph8BgNoekKZW4m4JAFNPyZ6edCMB0M4X7get9LetxdsiAK1NjPSItChl87wCEGmmYG45xtYBaH+SZuX0vp9Yj68HADzWBSbve88AtNp1kPxdTzH1BkD76yQro0f+jrd4egTA4pXg5siPAoClK2HXcwy9A1DSJbio8msAoETjyGxjp1YA1h+UVol3/TRSzKIB0BaIKX6wYum10KsNgPUZg5XSrp9FjVNkADROg5C7viYA+p4GoXd9jQB0OQ3C7/paAbjIKYSr8AFg875BGF8PAN27iJOaY1A7ANWLIAAAQQAABAAIAFCF+gtY/lR4qtJDdgAAAABJRU5ErkJggg=='  # optional; placeholder logo, see deploy/README.md
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
