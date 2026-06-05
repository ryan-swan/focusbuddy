#!/bin/sh
# Install the repo's git hooks into .git/hooks.
#
# We copy (rather than set core.hooksPath) so we don't touch your git config.
# Re-run this after a fresh clone, or whenever the tracked hooks change.
#
#   sh scripts/install-git-hooks.sh

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/scripts/git-hooks"
DEST="$REPO_ROOT/.git/hooks"

if [ ! -d "$SRC" ]; then
  echo "✗ No tracked hooks at $SRC"
  exit 1
fi

for hook in "$SRC"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$DEST/$name"
  chmod +x "$DEST/$name"
  echo "✓ installed $name → .git/hooks/$name"
done

echo "Done. Hooks active for this clone."
