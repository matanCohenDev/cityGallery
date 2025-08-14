set -euo pipefail

REMOTE="${1:-origin}"
BASE_BRANCH="${2:-main}"

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

git fetch "$REMOTE" || true
git checkout "$BASE_BRANCH"
git pull --rebase "$REMOTE" "$BASE_BRANCH" || true

i=1
for author in "${AUTHORS[@]}"; do
  name="${author%% <*}"             
  branch="student/$i-$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g;s/^-+|-+$//g')"
  echo "➡️  יוצר branch: $branch"
  git branch -D "$branch" 2>/dev/null || true
  git checkout -b "$branch" "$BASE_BRANCH"
  git push -u "$REMOTE" "$branch"
  i=$((i+1))
done

git checkout "$BASE_BRANCH"
echo "🎯 נוצרו ונדחפו כל ה-branches"
