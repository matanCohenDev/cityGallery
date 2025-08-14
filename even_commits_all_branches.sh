#!/bin/bash
set -euo pipefail

PREFIX="${1:-Update}"

# טוען את רשימת המחברות
if [ ! -f authors.txt ]; then
  echo "❌ authors.txt לא נמצא"; exit 1
fi

AUTHORS=()
while IFS= read -r line; do
  AUTHORS+=("$line")
done < authors.txt
if [ ${#AUTHORS[@]} -eq 0 ]; then
  echo "❌ authors.txt ריק"; exit 1
fi

# שומר את הענף הנוכחי
CURRENT_BRANCH=$(git branch --show-current)

# לוקח את כל הענפים המקומיים
BRANCHES=$(git branch --format="%(refname:short)")

for BRANCH in $BRANCHES; do
  echo "➡️ מעבר לענף: $BRANCH"
  git checkout "$BRANCH"

  # איסוף כל הקבצים שהשתנו
  FILES=()
  while IFS= read -r line; do
    status="${line:0:2}"
    path="${line:3}"
    path=$(printf "%s" "$path")
    FILES+=("$status|$path")
  done < <(git status --porcelain)

  if [ ${#FILES[@]} -eq 0 ]; then
    echo "ℹ️ אין שינויים ב-$BRANCH, ממשיכים..."
    continue
  fi

  idx=0
  for item in "${FILES[@]}"; do
    status="${item%%|*}"
    path="${item#*|}"
    author="${AUTHORS[$((idx % ${#AUTHORS[@]}))]}"
    idx=$((idx+1))

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
        newpath="${path#* -> }"
        git add -- "$newpath" 2>/dev/null || true
        ;;
      *)
        git add -A -- "$path" 2>/dev/null || true
        ;;
    esac

    if git diff --cached --quiet; then
      continue
    fi

    msg="$PREFIX: $path"
    GIT_COMMITTER_NAME="${author%% <*}" \
    GIT_COMMITTER_EMAIL="${author#*<}"   \
    GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL%>}" \
    git commit --author="$author" -m "$msg"

    echo "✅ Commit ב-$BRANCH כ-$author"
  done

  git push -u origin "$BRANCH"
done

# חזרה לענף המקורי
git checkout "$CURRENT_BRANCH"

echo "🎉 כל הענפים עודכנו בהצלחה!"
