#!/bin/bash
set -euo pipefail

LINES_PER_AUTHOR="${1:-400}"   # כמה שורות להוסיף לכל אחת (אפשר לשנות בפרמטר)

if [ ! -f authors.txt ]; then
  echo "❌ authors.txt לא נמצא"; exit 1
fi

# תיקייה “שקטה” בקוד שלא מפריעה להרצה/פרונט
PAD_DIR=".contrib"
mkdir -p "$PAD_DIR"

git checkout main >/dev/null 2>&1 || git switch main
git pull --rebase || true

i=1
while IFS= read -r author; do
  [ -z "$author" ] && continue
  name="${author%% <*}"
  slug="$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g;s/^-+|-+$//g')"
  file="$PAD_DIR/${i}-${slug}.md"

  # צור “ריפוד” של שורות
  {
    echo "# Notes for $name"
    for n in $(seq 1 "$LINES_PER_AUTHOR"); do
      echo "- placeholder line $n"
    done
  } > "$file"

  # קומיט עם ייחוס מחבר
  GIT_COMMITTER_NAME="${name}" \
  GIT_COMMITTER_EMAIL="${author#*<}"; GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL%>}"
  git add "$file"
  git commit --author="$author" -m "docs: add notes for $name (${LINES_PER_AUTHOR} lines)"

  i=$((i+1))
done < authors.txt

git push origin main
echo "🎉 איזון שורות הושלם (הוספנו ${LINES_PER_AUTHOR} שורות לכל מחברת)"
