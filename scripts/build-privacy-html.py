#!/usr/bin/env python3
"""Builds store/privacy-policy.html from docs/PRIVACY.md for the StratIT website.

The page uses the website's /styles.css and header; it is published in the stratit-website
repo at ai-account-guard/privacy/index.html.

Handles the small Markdown subset the policy uses: #/## headings, paragraphs, "- " bullets,
**bold**, *italic*, and [text](url) links. Edit docs/PRIVACY.md, then re-run this script.
"""
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "PRIVACY.md"
OUT = ROOT / "store" / "privacy-policy.html"


def inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    return re.sub(r"\[(.+?)\]\((.+?)\)", lambda m: f'<a href="{html.escape(m[2])}">{m[1]}</a>', text)


def convert(md):
    out, para, items = [], [], []

    def flush():
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()
        if items:
            out.append("<ul>\n" + "\n".join(f"  <li>{inline(i)}</li>" for i in items) + "\n</ul>")
            items.clear()

    for line in md.splitlines():
        stripped = line.strip()
        if not stripped:
            flush()
        elif stripped.startswith("#"):
            flush()
            level = len(stripped) - len(stripped.lstrip("#"))
            out.append(f"<h{level}>{inline(stripped[level:].strip())}</h{level}>")
        elif stripped.startswith("- "):
            if para:
                flush()
            items.append(stripped[2:])
        elif items and line.startswith("  "):
            items[-1] += " " + stripped  # continuation of a bullet
        else:
            para.append(stripped)
    flush()
    return "\n".join(out)


PAGE = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privacy Policy | AI Account Guard</title>
    <meta name="description" content="AI Account Guard privacy policy." />
    <link rel="canonical" href="https://stratitsolutions.com/ai-account-guard/privacy/" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <style>
      .policy {{ max-width: 760px; margin: 0 auto; padding: 48px 18px 72px; }}
      .policy h1 {{ font-size: 34px; line-height: 1.2; margin: 0 0 6px; color: var(--ink); }}
      .policy h2 {{ font-size: 21px; margin: 34px 0 8px; color: var(--ink); }}
      .policy em {{ color: var(--muted); font-style: normal; font-size: 14px; }}
      .policy a {{ color: var(--accent); }}
      .policy ul {{ padding-left: 22px; }}
      .policy li {{ margin: 8px 0; }}
      .brand {{ text-decoration: none; }}
    </style>
  </head>
  <body>
    <!-- Generated from docs/PRIVACY.md in the ai-account-guard repo by scripts/build-privacy-html.py.
         Edit the Markdown there and regenerate, rather than editing this file. -->
    <header class="nav">
      <div class="container nav-inner">
        <a class="brand" href="/">
          <img class="brand-mark" src="/stratit-shield.png" alt="" />
          <span>StratIT Solutions</span>
        </a>
      </div>
    </header>
    <main class="policy">
{body}
    </main>
  </body>
</html>
"""

if __name__ == "__main__":
    OUT.write_text(PAGE.format(body=convert(SRC.read_text())))
    print(OUT.relative_to(ROOT))
