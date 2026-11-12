#!/usr/bin/env python3
"""Checks the Group Policy template in deploy/group-policy/.

1. It is up to date with extension/schema.json and providers.js (build --check).
2. The ADMX and every ADML validate against Microsoft's ADMX schema, taken from the
   [MS-GPREG] specification on learn.microsoft.com (needs network and xmllint).
3. Every string and presentation the ADMX uses exists in every ADML, and each
   presentation fits its policy's elements.
4. Each setting writes the registry layout Chrome and Edge expect for extension policy,
   the same layout as deploy/intune/Set-AIAccountGuardPolicy.ps1: strings as REG_SZ,
   booleans as DWORD 1/0, lists as a subkey of values named 1, 2, 3..., and ProviderModes
   as a subkey of values named by service ID.

  python3 test/check_group_policy.py [--offline]   (--offline skips step 2)
"""
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GP = ROOT / "deploy" / "group-policy"
NS = {"p": "http://www.microsoft.com/GroupPolicy/PolicyDefinitions"}
EXTENSION_ID = "jhhgomolhbopcedgcnilbggglnfikmfd"
ROOTS = {"Chrome": r"Software\Policies\Google\Chrome", "Edge": r"Software\Policies\Microsoft\Edge"}

SPEC = "https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-gpreg/{}?accept=text/markdown"
SCHEMAS = {  # [MS-GPREG] Appendix B sections 7.1-7.3
    "BaseTypes.xsd": "81d92810-a6d2-4301-a607-b3ba34dc2989",
    "PolicyDefinitions.xsd": "81a89003-5121-4216-b788-fde8daa71c78",
    "PolicyDefinitionFiles.xsd": "ddeb37b6-22ab-4936-adc4-b9d7fe1de6e6",
}

failures = []


def check(ok, what):
    print(("ok    " if ok else "FAIL  ") + what)
    if not ok:
        failures.append(what)


def fetch_schemas(folder):
    """Saves Microsoft's ADMX schema files into folder, repaired for xmllint."""
    for name, page in SCHEMAS.items():
        with urllib.request.urlopen(SPEC.format(page), timeout=60) as r:
            md = r.read().decode("utf-8").replace("\r\n", "\n")
        block = next(b for b in re.findall(r"```[a-z]*\n(.*?)```", md, re.S) if "<xs:schema" in b)
        # The page wraps long lines at ~70 characters, sometimes inside quoted attribute
        # values; rejoin those. Wraps elsewhere are harmless whitespace.
        out, i, in_tag, quote = [], 0, False, None
        while i < len(block):
            c = block[i]
            if quote:
                if block.startswith("\n ", i):
                    i += 2
                    continue
                if c == quote:
                    quote = None
            elif block.startswith("<!--", i):
                j = block.index("-->", i) + 3
                out.append(block[i:j])
                i = j
                continue
            elif in_tag:
                if c in "\"'":
                    quote = c
                elif c == ">":
                    in_tag = False
            elif c == "<":
                in_tag = True
            out.append(c)
            i += 1
        xsd = "".join(out).lstrip()
        # Microsoft's patterns escape "$" as "\$", which .NET accepts but XML Schema doesn't.
        xsd = xsd.replace("\\$", "$")
        (folder / name).write_text(xsd, encoding="utf-8")


def main():
    offline = "--offline" in sys.argv[1:]

    # 1. Up to date
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build-group-policy.py"), "--check"],
                       capture_output=True, text=True)
    check(r.returncode == 0, "template is up to date with schema.json and providers.js" +
          ("" if r.returncode == 0 else "\n" + r.stdout + r.stderr))

    admx_path = GP / "AIAccountGuard.admx"
    adml_paths = sorted(GP.glob("*/AIAccountGuard.adml"))
    check("en-US" in [p.parent.name for p in adml_paths], "an en-US ADML exists (Group Policy Editor falls back to it)")

    # 2. Microsoft's schema
    if offline:
        print("skip  schema validation (--offline)")
    else:
        with tempfile.TemporaryDirectory() as tmp:
            fetch_schemas(Path(tmp))
            xsd = Path(tmp) / "PolicyDefinitionFiles.xsd"
            # The schema must reject a broken file, or a pass means nothing.
            bad = Path(tmp) / "bad.admx"
            bad.write_text(admx_path.read_text(encoding="utf-8").replace("<enabledValue>", "<enabledValu>", 1))
            r = subprocess.run(["xmllint", "--noout", "--schema", str(xsd), str(bad)], capture_output=True, text=True)
            check(r.returncode != 0, "Microsoft's schema rejects a broken ADMX")
            for f in [admx_path, *adml_paths]:
                r = subprocess.run(["xmllint", "--noout", "--schema", str(xsd), str(f)], capture_output=True, text=True)
                check(r.returncode == 0, f"{f.relative_to(ROOT)} matches Microsoft's ADMX schema" +
                      ("" if r.returncode == 0 else "\n" + r.stderr))

    # 3. Cross-references
    admx = ET.parse(admx_path).getroot()
    admx_text = admx_path.read_text(encoding="utf-8")
    used_strings = set(re.findall(r"\$\(string\.(\w+)\)", admx_text))
    used_pres = set(re.findall(r"\$\(presentation\.(\w+)\)", admx_text))
    string_sets = {}
    for path in adml_paths:
        lang = path.parent.name
        adml = ET.parse(path).getroot()
        strings = {s.get("id"): s.text or "" for s in adml.iterfind(".//p:stringTable/p:string", NS)}
        string_sets[lang] = set(strings)
        pres = {p.get("id"): p for p in adml.iterfind(".//p:presentationTable/p:presentation", NS)}
        check(used_strings <= set(strings), f"{lang}: every string the ADMX uses exists "
              f"(missing: {sorted(used_strings - set(strings))})")
        check(set(strings) <= used_strings, f"{lang}: no unused strings "
              f"(unused: {sorted(set(strings) - used_strings)})")
        check(all(t.strip() for t in strings.values()), f"{lang}: no empty strings")
        check(used_pres == set(pres), f"{lang}: presentations match the ADMX")
        for pol in admx.iterfind(".//p:policy", NS):
            ref = re.fullmatch(r"\$\(presentation\.(\w+)\)", pol.get("presentation") or "")
            els = pol.find("p:elements", NS)
            elements = {e.get("id") for e in (els if els is not None else [])}
            refs = {c.get("refId") for c in pres[ref.group(1)]} if ref else set()
            if refs != elements:
                check(False, f"{lang}: {pol.get('name')} presentation fits its elements")
    if len(string_sets) > 1:
        first = next(iter(string_sets.values()))
        check(all(s == first for s in string_sets.values()), "all ADMLs have the same string IDs")

    # 4. Registry layout
    schema = json.loads((ROOT / "extension" / "schema.json").read_text())["properties"]
    src = (ROOT / "extension" / "shared" / "providers.js").read_text()
    src = src[src.index("const PROVIDERS = ["):]
    providers = re.findall(r'^      id: "([a-z0-9-]+)",', src[: src.index("\n  ];")], re.M)
    check(len(providers) >= 10, f"found the AI services in providers.js ({len(providers)})")
    deferred = {"DashboardUrl", "DashboardOrgKey"}  # extension 0.2; see build-group-policy.py
    policies = list(admx.iterfind(".//p:policy", NS))
    check(all(p.get("class") == "Machine" for p in policies), "every policy is under Computer Configuration")

    for browser, base in ROOTS.items():
        key = rf"{base}\3rdparty\extensions\{EXTENSION_ID}\policy"
        mine = [p for p in policies if p.get("name").startswith(browser + "_")]
        # What each policy writes: (key, value name) -> description of the value
        writes = {}
        for p in mine:
            k, vn = p.get("key"), p.get("valueName")
            if vn:
                on, off = p.find("p:enabledValue/p:decimal", NS), p.find("p:disabledValue/p:decimal", NS)
                writes[(k, vn)] = ("dword", on.get("value") if on is not None else None,
                                   off.get("value") if off is not None else None)
            els = p.find("p:elements", NS)
            for e in els if els is not None else []:
                ek = e.get("key") or k
                tag = e.tag.split("}")[1]
                if tag == "text":
                    writes[(ek, e.get("valueName"))] = ("sz",)
                elif tag == "list":
                    writes[(ek, "*")] = ("list", e.get("valuePrefix"), e.get("expandable"), e.get("explicitValue"))
                elif tag == "enum":
                    vals = [i.find("p:value/p:string", NS) for i in e.iterfind("p:item", NS)]
                    writes[(ek, e.get("valueName"))] = ("enum", tuple(v.text if v is not None else None for v in vals))
                else:
                    writes[(ek, e.get("valueName"))] = ("unexpected", tag)

        expected = {}
        for name, spec in schema.items():
            if name in deferred:
                continue
            t = spec["type"]
            if t == "boolean":
                expected[(key, name)] = ("dword", "1", "0")
            elif t == "array":
                expected[(key + "\\" + name, "*")] = ("list", "", None, None)
            elif t == "object":
                modes = tuple(spec["additionalProperties"]["enum"])
                for pid in providers:
                    expected[(key + "\\ProviderModes", pid)] = ("enum", modes)
            elif "enum" in spec:
                expected[(key, name)] = ("enum", tuple(spec["enum"]))
            else:
                expected[(key, name)] = ("sz",)
        check(writes == expected, f"{browser}: every setting writes the registry layout the browser expects" + (
            "" if writes == expected else
            f"\n  missing: {sorted(set(expected) - set(writes))}\n  extra: {sorted(set(writes) - set(expected))}\n"
            f"  different: {[k for k in expected if k in writes and writes[k] != expected[k]]}"))

    if failures:
        print(f"{len(failures)} check(s) failed")
        sys.exit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()
