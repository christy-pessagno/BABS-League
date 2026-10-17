#!/usr/bin/env python3
"""Stamp index.html with a version tag for every CSS and JS file.

Browsers reuse cached files for a while after GitHub Pages serves them, so a
refresh can keep running old code. This gives each file a ?v=<content hash>
address that changes whenever the file does: the stylesheet and app.js are
tagged directly, and an import map tags the modules app.js imports.

Run before committing:  python3 tools/stamp.py
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"


def tag(path):
    return hashlib.sha1((ROOT / path).read_bytes()).hexdigest()[:8]


def main():
    html = INDEX.read_text()
    modules = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "js").glob("*.js"))

    html = re.sub(r'href="css/styles\.css(\?v=\w+)?"', 'href="css/styles.css?v=%s"' % tag("css/styles.css"), html)
    html = re.sub(r'src="js/app\.js(\?v=\w+)?"', 'src="js/app.js?v=%s"' % tag("js/app.js"), html)

    entries = ",\n".join('  "./%s": "./%s?v=%s"' % (m, m, tag(m)) for m in modules if m != "js/app.js")
    importmap = '<script type="importmap">\n{ "imports": {\n%s\n} }\n</script>' % entries
    if '<script type="importmap">' in html:
        html = re.sub(r'<script type="importmap">.*?</script>', lambda _: importmap, html, flags=re.S)
    else:
        html = html.replace('<script type="module"', importmap + '\n<script type="module"', 1)

    INDEX.write_text(html)
    print("Stamped", ", ".join(["css/styles.css"] + modules))


if __name__ == "__main__":
    main()
