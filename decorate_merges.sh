#!/bin/bash
set -euo pipefail

# דורש authors.txt (שם <email>) — לא צריך students.txt
if [ ! -f authors.txt ]; then
  echo "❌ authors.txt לא נמצא"; exit 1
fi

# ודא שעובדים על main ונקי
git checkout main >/dev/null 2>&1 || git switch main
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ יש שינויים לא מקומטים/בסטייג'. קמֵט או stash לפני הרצה."
  exit 1
fi

git pull --rebase || true

i=1
while IFS= read -r author; do
  [ -z "$author" ] && continue
  name="${author%% <*}"
  # יוצר שם ענף זמני קריא
  slug="$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g;s/^-+|-+$//g')"
  branch="decor/${i}-${slug}-$(date +%s)"

  echo "➡️ יוצר ענף: $branch"
  git checkout -b "$branch" >/dev/null 2>&1 || git switch -c "$branch"

  # קומיט ריק כדי ליצור בליטה בגרף; משייך את המחבר מה-authors.txt
  GIT_COMMITTER_NAME="${name}" \
  GIT_COMMITTER_EMAIL="${author#*<}"; GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL%>}"
  git commit --allow-empty --author="$author" -m "changes"

  # דחיפת הענף
  git push -u origin "$branch"

  # חזרה למיין ומיזוג עם no-ff כדי לשמור בליטה
  git checkout main >/dev/null 2>&1 || git switch main
  git merge --no-ff "$branch" -m "Merge $branch into main"

  # דחיפת המיין
  git push origin main

  # מחיקת הענף מקומית (משאיר אותו ב-remote כדי לראות צבעים)
  git branch -d "$branch" >/dev/null 2>&1 || true

  i=$((i+1))
done < authors.txt

echo "🎉 נוצרו בליטות ומיזוגים ל-main לכל המחברות מה-authors.txt"
