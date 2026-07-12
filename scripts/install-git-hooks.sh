#!/usr/bin/env bash
# Installs the repo's git hooks. Run once, after cloning:
#
#     ./scripts/install-git-hooks.sh
#
# WHY THIS EXISTS
# GitHub only enforces branch protection on private repos for paid plans. Until
# the account is upgraded, nothing on the server stops someone pushing straight
# to main. This hook is the stopgap: it refuses the push locally.
#
# It is a seatbelt, not a lock — anyone can bypass it with --no-verify. That is
# fine. It exists to stop the accident, not the determined.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="$REPO_ROOT/.git/hooks/pre-push"

cat > "$HOOK" <<'HOOK_EOF'
#!/usr/bin/env bash
# Refuse a direct push to main. Work on a branch and open a pull request.
set -euo pipefail

while read -r _local_ref _local_sha remote_ref _remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    cat >&2 <<'MSG'

  ✋ Direct pushes to main are not allowed.

  main is what the client runs. Every change goes through a pull request so
  that CI and a second pair of eyes see it first.

      git checkout -b fix/what-you-are-fixing
      git push -u origin fix/what-you-are-fixing
      gh pr create

  (If you genuinely need to override this, you know how — but say so on the PR.)

MSG
    exit 1
  fi
done

exit 0
HOOK_EOF

chmod +x "$HOOK"
echo "✔ pre-push hook installed — direct pushes to main will be refused."
