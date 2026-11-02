#!/usr/bin/env python3
"""Regenerate the social-sharing preview image (site/assets/img/og.png).

Optional: the image only needs rebuilding if the numbers change a lot.
Requires Playwright:  pip install playwright && python3 -m playwright install chromium
"""
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "og-image.html"
OUT = ROOT / "site" / "assets" / "img" / "og.png"

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Playwright is not installed. Run: pip install playwright && python3 -m playwright install chromium")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    page.goto(SRC.as_uri())
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT))
    browser.close()
print("Wrote", os.path.relpath(OUT, ROOT))
