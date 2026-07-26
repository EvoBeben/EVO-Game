# NFL Reports - Quick Update Prompt

**Use this minimal prompt to update reports:**

```
Update NFL report for [TEAM_ABBR]:
- Team: [CITY] [NAME]
- Colors: primary=[HEX1], secondary=[HEX2]
- Date: July 25, 2026
- Key changes: [BRIEF BULLET POINTS OF WHAT'S NEW]

Update the JSON at nfl-reports/[abbr].json with new info, then regenerate PDF.
```

## Example:
```
Update NFL report for CHI:
- Team: Chicago Bears
- Colors: primary=#0B162A, secondary=#C83803
- Date: July 25, 2026
- Key changes:
  - Caleb Williams injury update
  - New coordinator hired
  - Draft trade completed

Update the JSON at nfl-reports/chi.json, then regenerate PDF.
```

## To Regenerate All PDFs:

```bash
cd /home/user/EVO-Game/nfl-reports
python3 generate.py
git add *.pdf
git commit -m "Update NFL reports - [DATE]"
git push -u origin claude/chicago-bears-news-pdf-dfi2c3
```

## File Locations:
- **Script:** `nfl-reports/generate.py`
- **Data files:** `nfl-reports/*.json` (one per team)
- **Output PDFs:** `nfl-reports/*-report.pdf`

## JSON Structure (minimal):
```json
{
  "abbr": "CHI",
  "city": "Chicago",
  "name": "Bears",
  "primary": "#0B162A",
  "secondary": "#C83803",
  "date": "July 25, 2026",
  "subhead": "Brief summary of offseason story",
  "strip": [{"n": "Stat", "k": "Label"}, ...],
  "left": [...sections...],
  "right": [...sections...],
  "sources": "..."
}
```

## Update Workflow (Low Token Cost):

1. **Identify what changed** for a team
2. **Use the minimal prompt above** (don't re-explain the whole system)
3. **Provide just the new details** in key-value format
4. **Claude updates only that team's JSON**
5. **Run the generate.py script locally** to create PDFs
6. **Commit and push** using the git commands above

This keeps each update prompt under 100 tokens instead of re-reading all 32 teams.
