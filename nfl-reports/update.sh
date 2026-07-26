#!/bin/bash
# NFL Reports Update Script
# Regenerates PDFs and commits changes with minimal overhead

set -e

REPO_DIR="/home/user/EVO-Game"
REPORTS_DIR="$REPO_DIR/nfl-reports"
BRANCH="claude/chicago-bears-news-pdf-dfi2c3"

cd "$REPO_DIR"

echo "📋 NFL Reports Update Tool"
echo "================================"
echo ""

# Check if specific team was passed
if [ -n "$1" ]; then
    TEAM_ABBR="${1^^}"  # Convert to uppercase
    echo "🔄 Regenerating PDF for: $TEAM_ABBR"
    python3 "$REPORTS_DIR/generate.py" "$REPORTS_DIR/${TEAM_ABBR,,}.json"
    echo "✅ PDF regenerated: $TEAM_ABBR"
else
    echo "🔄 Regenerating all 32 team PDFs..."
    python3 "$REPORTS_DIR/generate.py"
    echo "✅ All PDFs regenerated"
fi

echo ""
echo "📊 Checking git status..."
git status --short | head -5

echo ""
echo "📤 Ready to commit? (y/n)"
read -r COMMIT_CHOICE

if [ "$COMMIT_CHOICE" = "y" ]; then
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M")

    git add "$REPORTS_DIR"/*.pdf

    if [ -n "$1" ]; then
        git commit -m "Update $TEAM_ABBR training camp report - $TIMESTAMP"
    else
        git commit -m "Update all NFL training camp reports - $TIMESTAMP"
    fi

    echo ""
    echo "🚀 Pushing to $BRANCH..."
    git push -u origin "$BRANCH"
    echo "✅ Pushed successfully"
else
    echo "⏭️  Skipped commit"
fi

echo ""
echo "✨ Done!"
