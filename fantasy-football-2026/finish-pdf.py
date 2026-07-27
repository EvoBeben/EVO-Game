#!/usr/bin/env python3
"""
Post-process the rendered PDF.

Chromium draws the running footer on every page including the cover, where it
lands as unreadable grey-on-near-black and breaks the full-bleed. There is no
per-page footer control in the print API, so the cover's footer band is painted
out here in the cover colour.

Usage: python3 finish-pdf.py The-Board-2026.pdf
"""
import sys
import fitz

COVER_INK = (0x14 / 255, 0x10 / 255, 0x0C / 255)


def main(path):
    doc = fitz.open(path)
    page = doc[0]

    # Locate the footer band rather than assuming it: it is the lowest text on
    # the cover, below the metadata rule.
    blocks = [b for b in page.get_text('blocks') if b[4].strip()]
    if not blocks:
        raise SystemExit('cover has no text — wrong file?')
    footer = max(blocks, key=lambda b: b[1])
    meta = sorted(blocks, key=lambda b: b[1])[-2]
    if footer[1] <= meta[3]:
        raise SystemExit('footer not below the metadata line; layout changed')

    top = (meta[3] + footer[1]) / 2          # midpoint, so neither is clipped
    band = fitz.Rect(0, top, page.rect.width, page.rect.height)
    page.draw_rect(band, color=COVER_INK, fill=COVER_INK, width=0)

    doc.saveIncr()
    print('masked cover footer over %.1f–%.1fpt' % (top, page.rect.height))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'The-Board-2026.pdf')
