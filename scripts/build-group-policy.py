#!/usr/bin/env python3
"""Builds the Group Policy template (ADMX + ADML) in deploy/group-policy/.

The settings come from extension/schema.json and the AI services from
extension/shared/providers.js, so the template can't drift from the extension. This file
holds only the wording (English and Dutch) and the order the settings appear in.

  python3 scripts/build-group-policy.py           write the files
  python3 scripts/build-group-policy.py --check   exit 1 if the files are out of date

test/check_group_policy.py validates the output against Microsoft's ADMX schema.
"""
import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "deploy" / "group-policy"
EXTENSION_ID = "jhhgomolhbopcedgcnilbggglnfikmfd"
REVISION = "1.0"

BROWSERS = [
    ("Chrome", r"Software\Policies\Google\Chrome"),
    ("Edge", r"Software\Policies\Microsoft\Edge"),
]

# Settings in extension/schema.json that the template leaves out, and why. Every other
# setting must appear in SETTINGS below (the build fails otherwise).
DEFERRED = {
    "DashboardUrl": "dashboard connection ships in extension 0.2",
    "DashboardOrgKey": "dashboard connection ships in extension 0.2",
}

# Display order within each browser's category. ProviderModes becomes one policy per AI
# service, in its own subcategory.
ORDER = [
    "AllowedDomains", "OrganizationName", "SsoPortalUrl", "SupportMessage",
    "AllowGoogleSignIn", "AllowMicrosoftSignIn", "MicrosoftTenantId",
    "TenantRestrictionScope", "SignOutOnInstall", "ProviderModes",
]

LANGS = ["en-US", "nl-NL"]

# ---- Wording -----------------------------------------------------------------------------
# Per language: "name" is the policy's title, "explain" its help text, "label" the caption
# beside its box or list (text, list and drop-down settings only).

COMMON = {
    "en-US": {
        "file_name": "AI Account Guard",
        "file_description": "Settings for the AI Account Guard browser extension in Google Chrome and Microsoft Edge.",
        "cat_root": "AI Account Guard",
        "cat_Chrome": "Google Chrome",
        "cat_Edge": "Microsoft Edge",
        "cat_services": "AI services",
        "supported": "AI Account Guard 0.1.5 or later",
        "mode_enforce": "Work accounts only",
        "mode_block": "Block entirely",
        "mode_off": "Not managed",
        "mode_label": "Mode:",
        "scope_ai-sites": "Only sign-ins started from an AI service",
        "scope_all-browsing": "All Google and Microsoft sign-ins in the browser",
        "service_explain": (
            "Sets how AI Account Guard handles {name}.\n\n"
            "Work accounts only: users can use {name} only when signed in with an account in "
            "your allowed email domains.\n"
            "Block entirely: {name} is blocked.\n"
            "Not managed: AI Account Guard leaves {name} alone.\n\n"
            "If you disable or don't configure this setting, {name} uses its default: {default}."
        ),
        "browser_note": "\n\nThis setting applies to {browser}. Use the same setting under {other} for that browser.",
    },
    "nl-NL": {
        "file_name": "AI Account Guard",
        "file_description": "Instellingen voor de browserextensie AI Account Guard in Google Chrome en Microsoft Edge.",
        "cat_root": "AI Account Guard",
        "cat_Chrome": "Google Chrome",
        "cat_Edge": "Microsoft Edge",
        "cat_services": "AI-diensten",
        "supported": "AI Account Guard 0.1.5 of hoger",
        "mode_enforce": "Alleen werkaccounts",
        "mode_block": "Volledig blokkeren",
        "mode_off": "Niet beheerd",
        "mode_label": "Modus:",
        "scope_ai-sites": "Alleen aanmeldingen die bij een AI-dienst beginnen",
        "scope_all-browsing": "Alle aanmeldingen bij Google en Microsoft in de browser",
        "service_explain": (
            "Bepaalt hoe AI Account Guard omgaat met {name}.\n\n"
            "Alleen werkaccounts: gebruikers kunnen {name} alleen gebruiken als ze zijn "
            "aangemeld met een account uit uw toegestane e-maildomeinen.\n"
            "Volledig blokkeren: {name} wordt geblokkeerd.\n"
            "Niet beheerd: AI Account Guard doet niets met {name}.\n\n"
            "Als u deze instelling uitschakelt of niet configureert, geldt de standaardinstelling: {default}."
        ),
        "browser_note": "\n\nDeze instelling geldt voor {browser}. Gebruik dezelfde instelling onder {other} voor die browser.",
    },
}

SETTINGS = {
    "AllowedDomains": {
        "en-US": {
            "name": "Allowed email domains",
            "label": "Domains:",
            "explain": (
                "Email domains whose accounts may sign in to the AI services AI Account Guard "
                "covers, one per line, for example example.org. Start a domain with *. to also "
                "allow its subdomains, for example *.example.org.\n\n"
                "Configure this setting whenever you use AI Account Guard. If it is missing or "
                "empty, every sign-in to a covered AI service is blocked.\n\n"
                "If none of the AI Account Guard settings reach the browser, an extension that "
                "you force-install blocks every AI sign-in and tells users IT is still setting it up."
            ),
        },
        "nl-NL": {
            "name": "Toegestane e-maildomeinen",
            "label": "Domeinen:",
            "explain": (
                "E-maildomeinen waarvan de accounts zich mogen aanmelden bij de AI-diensten die AI "
                "Account Guard beschermt, één per regel, bijvoorbeeld example.org. Begin een domein "
                "met *. om ook de subdomeinen toe te staan, bijvoorbeeld *.example.org.\n\n"
                "Configureer deze instelling altijd als u AI Account Guard gebruikt. Ontbreekt de "
                "lijst of is hij leeg, dan wordt elke aanmelding bij een beschermde AI-dienst "
                "geblokkeerd.\n\n"
                "Als geen enkele AI Account Guard-instelling de browser bereikt, blokkeert een "
                "geforceerd geïnstalleerde extensie elke AI-aanmelding en laat gebruikers weten "
                "dat IT de extensie nog instelt."
            ),
        },
    },
    "OrganizationName": {
        "en-US": {
            "name": "Organization name",
            "label": "Organization name:",
            "explain": "Your organization's name, shown to users on block messages.",
        },
        "nl-NL": {
            "name": "Naam van de organisatie",
            "label": "Naam van de organisatie:",
            "explain": "De naam van uw organisatie, zoals gebruikers die zien in blokkeringsmeldingen.",
        },
    },
    "SsoPortalUrl": {
        "en-US": {
            "name": "Company sign-in portal",
            "label": "Portal address:",
            "explain": (
                "The http or https address of your company sign-in portal, for example "
                "https://myapps.microsoft.com. Block messages then show a button that opens it, "
                "so users can sign in with their work account."
            ),
        },
        "nl-NL": {
            "name": "Aanmeldportaal van het bedrijf",
            "label": "Adres van het portaal:",
            "explain": (
                "Het http- of https-adres van het aanmeldportaal van uw bedrijf, bijvoorbeeld "
                "https://myapps.microsoft.com. Blokkeringsmeldingen tonen dan een knop die het "
                "portaal opent, zodat gebruikers zich kunnen aanmelden met hun werkaccount."
            ),
        },
    },
    "SupportMessage": {
        "en-US": {
            "name": "Support message",
            "label": "Message:",
            "explain": "Extra text shown on block messages, such as how to contact IT.",
        },
        "nl-NL": {
            "name": "Ondersteuningsbericht",
            "label": "Bericht:",
            "explain": "Extra tekst in blokkeringsmeldingen, bijvoorbeeld hoe gebruikers contact opnemen met IT.",
        },
    },
    "AllowGoogleSignIn": {
        "en-US": {
            "name": "Allow Sign in with Google for work accounts",
            "explain": (
                "If you enable or don't configure this setting, users can use \"Sign in with "
                "Google\" on covered AI services with a Google Workspace account in your allowed "
                "email domains. AI Account Guard tells Google which domains are allowed, and "
                "Google refuses personal Google accounts.\n\n"
                "If you disable this setting, \"Sign in with Google\" is blocked on covered AI services."
            ),
        },
        "nl-NL": {
            "name": "Aanmelden met Google toestaan voor werkaccounts",
            "explain": (
                "Als u deze instelling inschakelt of niet configureert, kunnen gebruikers "
                "\"Aanmelden met Google\" gebruiken bij beschermde AI-diensten met een Google "
                "Workspace-account uit uw toegestane e-maildomeinen. AI Account Guard geeft Google "
                "door welke domeinen zijn toegestaan, en Google weigert persoonlijke Google-accounts.\n\n"
                "Als u deze instelling uitschakelt, wordt \"Aanmelden met Google\" geblokkeerd bij "
                "beschermde AI-diensten."
            ),
        },
    },
    "AllowMicrosoftSignIn": {
        "en-US": {
            "name": "Allow Sign in with Microsoft for your tenant",
            "explain": (
                "If you enable this setting, users can use \"Sign in with Microsoft\" on covered "
                "AI services with an account in your Microsoft Entra tenant, using Microsoft "
                "tenant restrictions. Also configure \"Microsoft tenant ID\". Personal Microsoft "
                "accounts are always blocked.\n\n"
                "If you disable or don't configure this setting, \"Sign in with Microsoft\" is "
                "blocked on covered AI services."
            ),
        },
        "nl-NL": {
            "name": "Aanmelden met Microsoft toestaan voor uw tenant",
            "explain": (
                "Als u deze instelling inschakelt, kunnen gebruikers \"Aanmelden met Microsoft\" "
                "gebruiken bij beschermde AI-diensten met een account uit uw Microsoft Entra-tenant, "
                "via de tenantbeperkingen van Microsoft. Configureer ook \"Microsoft-tenant-ID\". "
                "Persoonlijke Microsoft-accounts worden altijd geblokkeerd.\n\n"
                "Als u deze instelling uitschakelt of niet configureert, wordt \"Aanmelden met "
                "Microsoft\" geblokkeerd bij beschermde AI-diensten."
            ),
        },
    },
    "MicrosoftTenantId": {
        "en-US": {
            "name": "Microsoft tenant ID",
            "label": "Tenant ID:",
            "explain": (
                "Your Microsoft Entra directory (tenant) ID, for example "
                "00000000-0000-0000-0000-000000000000. It is on the Overview page of the "
                "Microsoft Entra admin center. Required when \"Allow Sign in with Microsoft for "
                "your tenant\" is enabled."
            ),
        },
        "nl-NL": {
            "name": "Microsoft-tenant-ID",
            "label": "Tenant-ID:",
            "explain": (
                "De directory-ID (tenant-ID) van uw Microsoft Entra-omgeving, bijvoorbeeld "
                "00000000-0000-0000-0000-000000000000. U vindt deze op de overzichtspagina van het "
                "Microsoft Entra-beheercentrum. Verplicht als \"Aanmelden met Microsoft toestaan "
                "voor uw tenant\" is ingeschakeld."
            ),
        },
    },
    "TenantRestrictionScope": {
        "en-US": {
            "name": "Where Google and Microsoft account restrictions apply",
            "label": "Apply to:",
            "explain": (
                "Sets where the Google and Microsoft account restrictions from the settings above apply.\n\n"
                "Only sign-ins started from an AI service: the restrictions apply only when a "
                "user signs in to a covered AI service with Google or Microsoft.\n"
                "All Google and Microsoft sign-ins in the browser: the restrictions apply to every "
                "Google and Microsoft sign-in, so personal Google and Microsoft accounts can't "
                "sign in anywhere in the browser.\n\n"
                "If you disable or don't configure this setting, the restrictions apply only to "
                "sign-ins started from an AI service."
            ),
        },
        "nl-NL": {
            "name": "Bereik van de Google- en Microsoft-accountbeperkingen",
            "label": "Toepassen op:",
            "explain": (
                "Bepaalt waar de Google- en Microsoft-accountbeperkingen uit de instellingen "
                "hierboven gelden.\n\n"
                "Alleen aanmeldingen die bij een AI-dienst beginnen: de beperkingen gelden alleen "
                "als een gebruiker zich met Google of Microsoft aanmeldt bij een beschermde AI-dienst.\n"
                "Alle aanmeldingen bij Google en Microsoft in de browser: de beperkingen gelden "
                "voor elke aanmelding bij Google en Microsoft, zodat persoonlijke Google- en "
                "Microsoft-accounts zich nergens in de browser kunnen aanmelden.\n\n"
                "Als u deze instelling uitschakelt of niet configureert, gelden de beperkingen "
                "alleen voor aanmeldingen die bij een AI-dienst beginnen."
            ),
        },
    },
    "SignOutOnInstall": {
        "en-US": {
            "name": "Sign users out of AI services on install",
            "explain": (
                "If you enable this setting, AI Account Guard clears the cookies and site data of "
                "covered AI services when it is first installed, so sessions that were already "
                "signed in end and users sign in again with their work account. Services that "
                "share Google's or Microsoft's own sign-in (Gemini and Copilot) are skipped, so "
                "users aren't signed out of Google or Microsoft altogether.\n\n"
                "If you disable or don't configure this setting, existing sessions are not cleared."
            ),
        },
        "nl-NL": {
            "name": "Gebruikers bij installatie afmelden bij AI-diensten",
            "explain": (
                "Als u deze instelling inschakelt, wist AI Account Guard bij de eerste installatie "
                "de cookies en sitegegevens van beschermde AI-diensten. Bestaande sessies worden "
                "zo beëindigd en gebruikers melden zich opnieuw aan met hun werkaccount. Diensten "
                "die de aanmelding van Google of Microsoft zelf gebruiken (Gemini en Copilot) "
                "worden overgeslagen, zodat gebruikers niet helemaal bij Google of Microsoft "
                "worden afgemeld.\n\n"
                "Als u deze instelling uitschakelt of niet configureert, blijven bestaande sessies bestaan."
            ),
        },
    },
}

# ---- Inputs ------------------------------------------------------------------------------


def load_schema():
    return json.loads((ROOT / "extension" / "schema.json").read_text())["properties"]


def load_providers():
    """(id, name, default mode) for each AI service, from extension/shared/providers.js."""
    src = (ROOT / "extension" / "shared" / "providers.js").read_text()
    block = src[src.index("const PROVIDERS = ["):]
    block = block[: block.index("\n  ];")]
    found = re.findall(r'id: "([a-z0-9-]+)",\s*name: "([^"]+)",.*?mode: "(\w+)"', block, re.S)
    if not found:
        sys.exit("No providers found in providers.js; has its layout changed?")
    return found


# ---- Build -------------------------------------------------------------------------------


def policy_key(base):
    return rf"{base}\3rdparty\extensions\{EXTENSION_ID}\policy"


def kind_of(name, spec):
    t = spec["type"]
    if t == "array":
        return "list"
    if t == "boolean":
        return "bool"
    if t == "object":
        return "services"
    if t == "string":
        return "enum" if "enum" in spec else "text"
    sys.exit(f"Unsupported type {t!r} for {name} in schema.json")


def build():
    schema = load_schema()
    providers = load_providers()

    missing = set(schema) - set(ORDER) - set(DEFERRED)
    extra = set(ORDER) - set(schema)
    if missing or extra:
        sys.exit(f"schema.json and ORDER disagree. Not in ORDER: {sorted(missing)}; not in schema: {sorted(extra)}")
    for name in ORDER:
        if name != "ProviderModes":
            for lang in LANGS:
                if lang not in SETTINGS[name]:
                    sys.exit(f"No {lang} wording for {name}")
    service_modes = schema["ProviderModes"]["additionalProperties"]["enum"]
    scope_values = schema["TenantRestrictionScope"]["enum"]

    policies = []  # ADMX <policy> elements
    presentations = {}  # id -> per-language XML
    strings = {lang: {} for lang in LANGS}  # id -> text

    def add_string(sid, per_lang):
        for lang in LANGS:
            strings[lang][sid] = per_lang(lang)

    add_string("SUPPORTED_AAG", lambda l: COMMON[l]["supported"])
    add_string("Cat_AIAccountGuard", lambda l: COMMON[l]["cat_root"])
    for mode in service_modes:
        add_string(f"Mode_{mode}", lambda l, m=mode: COMMON[l][f"mode_{m}"])
    for scope in scope_values:
        sid = "Scope_" + scope.replace("-", "_")
        add_string(sid, lambda l, s=scope: COMMON[l][f"scope_{s}"])

    def note(lang, browser):
        other = "Microsoft Edge" if browser == "Chrome" else "Google Chrome"
        return COMMON[lang]["browser_note"].format(browser=COMMON[lang][f"cat_{browser}"], other=other)

    categories = ['    <category name="Cat_AIAccountGuard" displayName="$(string.Cat_AIAccountGuard)"/>']
    for browser, base in BROWSERS:
        cat, svc_cat = f"Cat_{browser}", f"Cat_{browser}_Services"
        add_string(cat, lambda l, b=browser: COMMON[l][f"cat_{b}"])
        add_string(svc_cat, lambda l: COMMON[l]["cat_services"])
        categories.append(
            f'    <category name="{cat}" displayName="$(string.{cat})">\n'
            f'      <parentCategory ref="Cat_AIAccountGuard"/>\n'
            f"    </category>"
        )
        categories.append(
            f'    <category name="{svc_cat}" displayName="$(string.{svc_cat})">\n'
            f'      <parentCategory ref="{cat}"/>\n'
            f"    </category>"
        )
        key = policy_key(base)

        for name in ORDER:
            spec = schema[name]
            kind = kind_of(name, spec)
            if kind == "services":
                for pid, pname, default in providers:
                    pol = f"{browser}_ProviderModes_{pid.replace('-', '_')}"
                    add_string(
                        pol,
                        lambda l, n=pname: n,
                    )
                    add_string(
                        pol + "_Explain",
                        lambda l, n=pname, d=default, b=browser: COMMON[l]["service_explain"].format(
                            name=n, default=COMMON[l][f"mode_{d}"]
                        ) + note(l, b),
                    )
                    items = "\n".join(
                        f'          <item displayName="$(string.Mode_{m})"><value><string>{m}</string></value></item>'
                        for m in service_modes
                    )
                    policies.append(
                        f'    <policy name="{pol}" class="Machine" displayName="$(string.{pol})" '
                        f'explainText="$(string.{pol}_Explain)" presentation="$(presentation.ProviderMode)" '
                        f'key="{key}\\ProviderModes">\n'
                        f'      <parentCategory ref="{svc_cat}"/>\n'
                        f'      <supportedOn ref="SUPPORTED_AAG"/>\n'
                        f"      <elements>\n"
                        f'        <enum id="ProviderMode" valueName="{pid}" required="true">\n'
                        f"{items}\n"
                        f"        </enum>\n"
                        f"      </elements>\n"
                        f"    </policy>"
                    )
                presentations["ProviderMode"] = lambda l: (
                    f'      <presentation id="ProviderMode">\n'
                    f'        <dropdownList refId="ProviderMode" noSort="true" defaultItem="0">{escape(COMMON[l]["mode_label"])}</dropdownList>\n'
                    f"      </presentation>"
                )
                continue

            pol = f"{browser}_{name}"
            add_string(pol, lambda l, n=name: SETTINGS[n][l]["name"])
            add_string(pol + "_Explain", lambda l, n=name, b=browser: SETTINGS[n][l]["explain"] + note(l, b))
            head = (
                f'    <policy name="{pol}" class="Machine" displayName="$(string.{pol})" '
                f'explainText="$(string.{pol}_Explain)"'
            )
            tail = f'      <parentCategory ref="{cat}"/>\n      <supportedOn ref="SUPPORTED_AAG"/>\n'

            if kind == "bool":
                policies.append(
                    f'{head} key="{key}" valueName="{name}">\n{tail}'
                    f'      <enabledValue><decimal value="1"/></enabledValue>\n'
                    f'      <disabledValue><decimal value="0"/></disabledValue>\n'
                    f"    </policy>"
                )
                continue

            if kind == "list":
                element = f'        <list id="{name}" key="{key}\\{name}" valuePrefix=""/>'
                pres = lambda l, n=name: f'        <listBox refId="{n}">{escape(SETTINGS[n][l]["label"])}</listBox>'
            elif kind == "text":
                element = f'        <text id="{name}" valueName="{name}" required="true" maxLength="1024"/>'
                pres = lambda l, n=name: (
                    f'        <textBox refId="{n}">\n'
                    f'          <label>{escape(SETTINGS[n][l]["label"])}</label>\n'
                    f"        </textBox>"
                )
            else:  # enum
                items = "\n".join(
                    f'          <item displayName="$(string.Scope_{v.replace("-", "_")})"><value><string>{v}</string></value></item>'
                    for v in spec["enum"]
                )
                element = f'        <enum id="{name}" valueName="{name}" required="true">\n{items}\n        </enum>'
                pres = lambda l, n=name: (
                    f'        <dropdownList refId="{n}" noSort="true" defaultItem="0">'
                    f'{escape(SETTINGS[n][l]["label"])}</dropdownList>'
                )
            presentations[name] = lambda l, n=name, p=pres: (
                f'      <presentation id="{n}">\n{p(l)}\n      </presentation>'
            )
            policies.append(
                f'{head} presentation="$(presentation.{name})" key="{key}">\n{tail}'
                f"      <elements>\n{element}\n      </elements>\n"
                f"    </policy>"
            )

    admx = f"""<?xml version="1.0" encoding="utf-8"?>
<!--
  AI Account Guard Group Policy template.
  Generated by scripts/build-group-policy.py from extension/schema.json; don't edit by hand.
  Writes the extension's settings for Google Chrome and Microsoft Edge (extension ID
  {EXTENSION_ID}). It doesn't install the extension.
-->
<policyDefinitions xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" revision="{REVISION}" schemaVersion="1.0" xmlns="http://www.microsoft.com/GroupPolicy/PolicyDefinitions">
  <policyNamespaces>
    <target prefix="aiaccountguard" namespace="StratITSolutions.Policies.AIAccountGuard"/>
  </policyNamespaces>
  <resources minRequiredRevision="{REVISION}"/>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_AAG" displayName="$(string.SUPPORTED_AAG)"/>
    </definitions>
  </supportedOn>
  <categories>
{chr(10).join(categories)}
  </categories>
  <policies>
{chr(10).join(policies)}
  </policies>
</policyDefinitions>
"""

    admls = {}
    for lang in LANGS:
        rows = "\n".join(
            f'      <string id="{sid}">{escape(text)}</string>' for sid, text in strings[lang].items()
        )
        pres = "\n".join(p(lang) for p in presentations.values())
        admls[lang] = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/build-group-policy.py; don't edit by hand. -->
<policyDefinitionResources xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" revision="{REVISION}" schemaVersion="1.0" xmlns="http://www.microsoft.com/GroupPolicy/PolicyDefinitions">
  <displayName>{escape(COMMON[lang]["file_name"])}</displayName>
  <description>{escape(COMMON[lang]["file_description"])}</description>
  <resources>
    <stringTable>
{rows}
    </stringTable>
    <presentationTable>
{pres}
    </presentationTable>
  </resources>
</policyDefinitionResources>
"""

    files = {OUT / "AIAccountGuard.admx": admx}
    for lang, text in admls.items():
        files[OUT / lang / "AIAccountGuard.adml"] = text
    return files


def main():
    check = "--check" in sys.argv[1:]
    stale = []
    for path, text in build().items():
        # Windows tools expect CRLF line endings in ADMX/ADML files.
        data = text.replace("\n", "\r\n").encode("utf-8")
        if check:
            if not path.exists() or path.read_bytes() != data:
                stale.append(path.relative_to(ROOT))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            print(f"wrote {path.relative_to(ROOT)}")
    if stale:
        print("Out of date (run scripts/build-group-policy.py):", *stale, sep="\n  ")
        sys.exit(1)


if __name__ == "__main__":
    main()
