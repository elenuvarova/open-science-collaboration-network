"""The CSP allows the app's two <style> elements by hash. If either text changes
(a Cytoscape upgrade, an edit to the meeting card's print rule), the browser would
silently drop the style; this test catches it first."""
import base64
import hashlib
import os
import re

import pytest

import main

FRONTEND = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")


def _hash(text: str) -> str:
    return "sha256-" + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()


def test_meeting_card_print_style_is_allowed():
    src = open(os.path.join(FRONTEND, "src", "components", "MeetingCard.jsx")).read()
    styles = re.findall(r'<style media="print">\{"([^"]*)"\}</style>', src)
    assert styles, "meeting card print <style> not found"
    for text in styles:
        assert _hash(text) in main.CSP_STYLE_HASHES


def test_cytoscape_container_style_is_allowed():
    path = os.path.join(FRONTEND, "node_modules", "cytoscape", "dist", "cytoscape.esm.mjs")
    if not os.path.exists(path):
        pytest.skip("frontend dependencies not installed")
    src = open(path).read()
    assert "stylesheet.textContent = '.' + className + ' { position: relative; }'" in src
    assert _hash(".__________cytoscape_container { position: relative; }") in main.CSP_STYLE_HASHES


def test_csp_has_no_inline_styles_or_google_fonts():
    assert "unsafe-inline" not in main._CSP
    assert "googleapis" not in main._CSP and "gstatic" not in main._CSP
