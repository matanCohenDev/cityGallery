#!/bin/bash
# even_commits.sh — Round-Robin commit authors per changed file
set -euo pipefail

# שימוש:
#   ./even_commits.sh "Feat"          # פרפיקס להודעת הקומיט
#   ./even_commits.sh "Fix"           # דוגמא נוספת
PREFIX="${1:-Update}"

# בדיקת authors.txt
if [ ! -f authors.txt ]; then
  echo "❌ authors.txt לא נמצא בשורש הריפו"; exit 1
fi
AUTHORS=()
while IFS= read -r line; do
  AUTHORS+=("$line")
done < authors.txt
if [ ${#AUTHORS[@]} -eq 0 ]; then
  echo "❌ authors.txt ריק"; exit 1
fi

# אסוף קבצים ששונו/נוספו/נמחקו/הועברו
FILES=()
while IFS= read -r line; do
  status="${line:0:2}"         # שני התווים הראשונים של הסטטוס
  path="${line:3}"             # הנתיב מהתו הרביעי
  path=$(printf "%s" "$path")
  FILES+=("$status|$path")
done < <(git status --porcelain)

if [ ${#FILES[@]} -eq 0 ]; then
  echo "ℹ️ אין שינויים לבצע להם קומיט"; exit 0
fi

idx=0
for item in "${FILES[@]}"; do
  status="${item%%|*}"
  path="${item#*|}"
  author="${AUTHORS[$((idx % ${#AUTHORS[@]}))]}"
  idx=$((idx+1))

  # נקה staging כדי שכל קומיט יהיה נקי
  git reset

  case "$status" in
    " M"|"M "|"MM"|"AM"|"A " )
      git add -- "$path"
      ;;
    "??")
      git add -- "$path"
      ;;
    " D"|"D ")
      git rm -- "$path"
      ;;
    R*)
      # שינוי שם — ננסה להוסיף את הנתיב החדש (פורמט: "R  old -> new")
      newpath="${path#* -> }"
      git add -- "$newpath" 2>/dev/null || true
      ;;
    *)
      # ברירת מחדל — ננסה להוסיף
      git add -A -- "$path" 2>/dev/null || true
      ;;
  esac

  # דלג אם אין מה לקמֶט
  if git diff --cached --quiet; then
    continue
  fi

  msg="$PREFIX: $path"
  GIT_COMMITTER_NAME="${author%% <*}" \
  GIT_COMMITTER_EMAIL="${author#*<}"   \
  GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL%>}" \
  git commit --author="$author" -m "$msg"

  echo "✅ Committed '$path' as $author"
done

echo "🎉 סבב קומיטים הושלם בהצלחה"
echo "טיפ: git push (או git push -u origin <branch>)"
