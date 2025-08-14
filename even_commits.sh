#!/usr/bin/env bash
set -euo pipefail

PREFIX="${1:-Update}"

# --- Read authors.txt ---
if [ ! -f authors.txt ]; then
  echo "❌ authors.txt לא נמצא בשורש הריפו"; exit 1
fi

AUTHORS=()
while IFS= read -r line; do
  # דילוג על שורות ריקות או הערות
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  # בדיקת פורמט "Name <email>"
  if echo "$line" | grep -Eq '^[^#[:space:]].* <[^>]+>$'; then
    AUTHORS+=("$line")
  fi
done < authors.txt

if [ ${#AUTHORS[@]} -eq 0 ]; then
  echo "❌ authors.txt ריק או לא בפורמט 'Name <email>'"; exit 1
fi

# --- Any changes? ---
if ! git status --porcelain | grep -q .; then
  echo "ℹ️ אין שינויים לבצע להם קומיט"; exit 0
fi

# =========================
# SINGLE AUTHOR -> ONE COMMIT
# =========================
if [ ${#AUTHORS[@]} -eq 1 ]; then
  author="${AUTHORS[0]}"
  name="${author%% <*}"
  email="${author#*<}"; email="${email%>}"

  git add -A
  if git diff --cached --quiet; then
    echo "ℹ️ אין שינויים ב־staging"; exit 0
  fi

  GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" \
  GIT_COMMITTER_NAME="$name" GIT_COMMITTER_EMAIL="$email" \
    git commit -m "$PREFIX: bulk changes"

  echo "✅ קומיט מרוכז אחד נוצר בשם $author"
  echo "טיפ: git push"
  exit 0
fi

# =========================
# MULTIPLE AUTHORS -> ROUND-ROBIN PER FILE
# =========================
FILES=()
while IFS= read -r line; do
  status="${line:0:2}"
  path="${line:3}"
  FILES+=("$status|$path")
done < <(git status --porcelain)

idx=0
for item in "${FILES[@]}"; do
  status="${item%%|*}"
  path="${item#*|}"

  author="${AUTHORS[$((idx % ${#AUTHORS[@]}))]}"
  name="${author%% <*}"
  email="${author#*<}"; email="${email%>}"
  idx=$((idx+1))

  git reset

  case "$status" in
    " M"|"M "|"MM"|"AM"|"A ")
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

  GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" \
  GIT_COMMITTER_NAME="$name" GIT_COMMITTER_EMAIL="$email" \
    git commit --author="$author" -m "$PREFIX: $path"

  echo "✅ Committed '$path' as $author"
done

echo "🎉 סבב קומיטים (Round-Robin) הושלם"
echo "טיפ: git push"
