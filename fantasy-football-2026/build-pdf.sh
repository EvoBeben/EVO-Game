#!/usr/bin/env bash
# Build the print PDF from index.html.
#
# Two render passes: the first establishes where each section lands so the
# contents page can carry real page numbers, the second bakes them in.
#
#   ./build-pdf.sh
set -euo pipefail
cd "$(dirname "$0")"

PY="${PDF_PY:-/tmp/claude-0/-home-user-EVO-Game/59bc869c-1431-56bd-a88b-7a91a9e38882/scratchpad/venv/bin/python}"
PDF=The-Board-2026.pdf

echo "pass 1 — layout"
python3 build-pdf.py >/dev/null
node make-pdf.mjs >/dev/null

TOC=$("$PY" - "$PDF" <<'EOF'
import re, sys
from pypdf import PdfReader
titles = ['2025 Recap','Strategy','Running back','Wide receiver','Tight end',
          'Quarterback','Defense','Draft plan','Mock drafts','Sources']
r = PdfReader(sys.argv[1]); found = {}
for i, pg in enumerate(r.pages, 1):
    head = ' '.join((pg.extract_text() or '').split()[:8]).lower()
    for t in titles:
        if t not in found and re.search(re.escape(t.lower()), head):
            found[t] = i
missing = [t for t in titles if t not in found]
if missing:
    sys.exit('could not locate sections: %s' % missing)
print(','.join(str(found[t]) for t in titles))
EOF
)
echo "  sections start on pages: $TOC"

echo "pass 2 — contents"
python3 build-pdf.py --toc "$TOC" >/dev/null
node make-pdf.mjs >/dev/null
"$PY" finish-pdf.py "$PDF"

"$PY" - "$PDF" "$TOC" <<'EOF'
import re, sys
from pypdf import PdfReader
titles = ['2025 Recap','Strategy','Running back','Wide receiver','Tight end',
          'Quarterback','Defense','Draft plan','Mock drafts','Sources']
r = PdfReader(sys.argv[1]); claimed = [int(x) for x in sys.argv[2].split(',')]
found = {}
for i, pg in enumerate(r.pages, 1):
    head = ' '.join((pg.extract_text() or '').split()[:8]).lower()
    for t in titles:
        if t not in found and re.search(re.escape(t.lower()), head):
            found[t] = i
actual = [found[t] for t in titles]
assert actual == claimed, 'contents drifted: %s vs %s' % (actual, claimed)
blank = [i for i, pg in enumerate(r.pages, 1) if not (pg.extract_text() or '').strip()]
assert not blank, 'blank pages: %s' % blank
print('verified — %d pages, contents accurate, no blank pages' % len(r.pages))
EOF
