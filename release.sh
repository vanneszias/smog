#!/bin/bash
# Usage: ./generate-release-notes.sh [from-tag] [to-tag/branch]
# Example: ./generate-release-notes.sh v1.0.0 HEAD
# Example: ./generate-release-notes.sh v1.0.0 v1.1.0

FROM=${1:-$(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")}
TO=${2:-HEAD}

# Get the remote URL and convert it to HTTPS format for web viewing
REPO_URL=$(git config --get remote.origin.url | sed 's/\.git$//')

# Convert SSH URLs to HTTPS format for GitLab
# Example: git@git.zias.be:zias/smog.git -> https://git.zias.be/zias/smog
if [[ $REPO_URL =~ ^git@([^:]+):(.+)$ ]]; then
  REPO_URL="https://${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
fi

# If it's already HTTPS but has .git, remove it
REPO_URL=$(echo "$REPO_URL" | sed 's/\.git$//')

echo "SMOG & Co: vx.x.x-x"
echo "| Type | Beschrijving | Commit |"
echo "|------|-------------|--------|"

git log --pretty=format:"%H|%s" "$FROM".."$TO" --reverse | while IFS='|' read -r hash subject; do
  short_hash=$(echo "$hash" | cut -c1-7)
  
  # Determine type and emoji based on commit message prefix
  if [[ $subject =~ ^fix:|^bugfix: ]]; then
    type="🐛 Fix"
    description=$(echo "$subject" | sed 's/^fix://;s/^bugfix://' | sed 's/^ *//')
  elif [[ $subject =~ ^feat:|^feature: ]]; then
    type="✨ Feature"
    description=$(echo "$subject" | sed 's/^feat://;s/^feature://' | sed 's/^ *//')
  elif [[ $subject =~ ^chore: ]]; then
    type="🧹 Chore"
    description=$(echo "$subject" | sed 's/^chore://' | sed 's/^ *//')
  elif [[ $subject =~ ^docs: ]]; then
    type="📝 Docs"
    description=$(echo "$subject" | sed 's/^docs://' | sed 's/^ *//')
  elif [[ $subject =~ ^refactor: ]]; then
    type="♻️ Refactor"
    description=$(echo "$subject" | sed 's/^refactor://' | sed 's/^ *//')
  elif [[ $subject =~ ^perf: ]]; then
    type="⚡ Performance"
    description=$(echo "$subject" | sed 's/^perf://' | sed 's/^ *//')
  elif [[ $subject =~ ^test: ]]; then
    type="✅ Test"
    description=$(echo "$subject" | sed 's/^test://' | sed 's/^ *//')
  else
    type="📦 Update"
    description="$subject"
  fi
  
  echo "| $type | $description | [$short_hash]($REPO_URL/commit/$hash) |"
done

# Add the TO commit separately to ensure it's included
TO_HASH=$(git rev-parse "$TO")
TO_SUBJECT=$(git log -1 --pretty=format:"%s" "$TO")
short_hash=$(echo "$TO_HASH" | cut -c1-7)

if [[ $TO_SUBJECT =~ ^fix:|^bugfix: ]]; then
  type="🐛 Fix"
  description=$(echo "$TO_SUBJECT" | sed 's/^fix://;s/^bugfix://' | sed 's/^ *//')
elif [[ $TO_SUBJECT =~ ^feat:|^feature: ]]; then
  type="✨ Feature"
  description=$(echo "$TO_SUBJECT" | sed 's/^feat://;s/^feature://' | sed 's/^ *//')
elif [[ $TO_SUBJECT =~ ^chore: ]]; then
  type="🧹 Chore"
  description=$(echo "$TO_SUBJECT" | sed 's/^chore://' | sed 's/^ *//')
elif [[ $TO_SUBJECT =~ ^docs: ]]; then
  type="📝 Docs"
  description=$(echo "$TO_SUBJECT" | sed 's/^docs://' | sed 's/^ *//')
elif [[ $TO_SUBJECT =~ ^refactor: ]]; then
  type="♻️ Refactor"
  description=$(echo "$TO_SUBJECT" | sed 's/^refactor://' | sed 's/^ *//')
elif [[ $TO_SUBJECT =~ ^perf: ]]; then
  type="⚡ Performance"
  description=$(echo "$TO_SUBJECT" | sed 's/^perf://' | sed 's/^ *//')
elif [[ $TO_SUBJECT =~ ^test: ]]; then
  type="✅ Test"
  description=$(echo "$TO_SUBJECT" | sed 's/^test://' | sed 's/^ *//')
else
  type="📦 Update"
  description="$TO_SUBJECT"
fi

echo "| $type | $description | [$short_hash]($REPO_URL/commit/$TO_HASH) |"

echo ""
echo "Verbeteringen komen snel! Feedback is welkom!"
echo ""
echo "---"
echo "**Note:** This is a prerelease version. Expect bugs and changes."

