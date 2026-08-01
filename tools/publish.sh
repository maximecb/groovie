#!/bin/bash

# Publishes the site to GitHub Pages, as the gh-pages branch of the repo.
#
# What gets published is what is committed, not what is in the working tree:
# the files come out of HEAD, and the script refuses to run with uncommitted
# changes. A published site is a thing other people are looking at, so it
# should always be possible to say which commit they are looking at.
#
# The gh-pages branch is generated rather than written, so it is replaced by a
# single commit each time rather than added to. Nothing is kept there that
# isn't in main, which is why force-pushing it loses nothing.
#
# Run it with `./tools/publish.sh` from anywhere in the repo. Pass --dry-run to
# see what would be published without pushing anything, and --yes to skip the
# confirmation prompt.
#
# The first publish only puts the branch there. GitHub serves it once the repo
# has Pages pointed at the root of gh-pages, under Settings -> Pages, which is
# a one-time thing done through the web interface. Note that Pages on a private
# repo needs a paid plan; on a public one it is free.

set -u

# Paths are relative to the repo root, so the script can be run from anywhere
cd "$(dirname "$0")/.." || exit 1

# The branch GitHub Pages serves from
readonly PUBLISH_BRANCH='gh-pages'

# Everything the site needs to run, and nothing else. The tests, the tools and
# the design notes are part of the repo rather than part of the site, and a
# visitor has no use for them.
#
# This is a list rather than "everything but", so that a file added to the repo
# is not published until somebody says it should be. Anything named here has to
# exist in HEAD or the publish fails, which is what catches a file renamed in
# one place and not the other.
readonly SITE_PATHS=(
    index.html
    style.css
    logo.svg
    favicon.svg
    favicon.ico
    og_image.png
    main.js
    model.js
    view.js
    audio.js
    sample_list.js
    samples
)

dry_run=false
assume_yes=false

for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) dry_run=true ;;
        -y|--yes) assume_yes=true ;;
        -h|--help)
            # The comment block at the top of this file, which is the
            # documentation, read up to wherever it happens to end
            awk 'NR > 2 { if (!/^#/) exit; sub(/^# ?/, ""); print }' "$0"
            exit 0
            ;;
        *)
            echo "Error: unknown option '$arg'. Try --help." >&2
            exit 1
            ;;
    esac
done

fail()
{
    echo "Error: $1" >&2
    exit 1
}

command -v git &> /dev/null || fail "git is not installed."

git rev-parse --git-dir &> /dev/null || fail "not inside a git repository."

remote_url=$(git remote get-url origin 2>/dev/null) ||
    fail "no 'origin' remote to publish to."

# Publishing the working tree would put a site up that matches no commit, so
# there would be no way to tell later what was actually served. A dry run
# publishes nothing, so there it is worth saying rather than stopping over:
# looking at what a publish would carry is a reasonable thing to do while
# still working on it.
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    if [ "$dry_run" = true ]; then
        echo 'Note: the working tree has uncommitted changes. They are not'
        echo '      part of what is shown below, which comes from HEAD.'
    else
        fail "the working tree has uncommitted changes. Commit or stash them first."
    fi
fi

source_commit=$(git rev-parse --short HEAD)
source_commit_full=$(git rev-parse HEAD)
source_subject=$(git log -1 --pretty=%s)

# Where the site ends up and where its code lives, both worked out from the
# remote, so that the script says where it published rather than leaving it to
# be guessed and so that the footer can link the commit it writes in.
#
# A remote comes in two shapes, git@host:owner/repo and https://host/owner/repo,
# and this takes the owner and the repo off either. It is done with parameter
# expansion rather than a regex because sed on macOS and sed on the CI runner
# don't agree on what an extended regex is.
slug=${remote_url%.git}

case "$slug" in
    *://*) slug=${slug#*://}; slug=${slug#*/} ;;    # https://host/owner/repo
    *:*)   slug=${slug#*@};   slug=${slug#*:} ;;    # git@host:owner/repo
esac

owner=${slug%%/*}
repo=${slug##*/}

if [ -n "$owner" ] && [ -n "$repo" ] && [ "$owner" != "$slug" ]; then
    site_url="https://${owner}.github.io/${repo}/"
    settings_url="https://github.com/${owner}/${repo}/settings/pages"
    commit_url="https://github.com/${owner}/${repo}/commit/${source_commit_full}"
else
    # An unrecognised remote is no reason not to publish, only a reason not to
    # claim to know where it lands
    site_url='(could not work out the URL from the remote)'
    settings_url='the repository settings, under Pages'
    commit_url=''
fi

# A file listed above but missing from HEAD would publish a broken site, and
# the failure would show up as a blank page rather than as an error here
for path in "${SITE_PATHS[@]}"; do
    git cat-file -e "HEAD:$path" 2>/dev/null ||
        fail "'$path' is not in HEAD. Update SITE_PATHS in $(basename "$0")."
done

# The same checks CI runs. Publishing is the one moment where shipping a
# broken build costs something, so it is worth the few seconds.
echo 'Running checks...'

./tools/check_js.sh > /dev/null || fail "JavaScript syntax check failed."
./tools/run_tests.sh > /dev/null 2>&1 || fail "tests failed. Run ./tools/run_tests.sh to see why."

if command -v python3 &> /dev/null; then
    python3 tools/check_samples.py > /dev/null || fail "sample check failed."
else
    echo 'Warning: python3 not installed, skipping the sample check.'
fi

echo 'Checks passed.'

# Assemble the site from HEAD, so that what is published is a commit rather
# than whatever happens to be lying around in the working tree
stage=$(mktemp -d) || fail "could not create a temporary directory."
trap 'rm -rf "$stage"' EXIT

git archive HEAD -- "${SITE_PATHS[@]}" | tar -x -C "$stage" ||
    fail "could not assemble the site from HEAD."

# Without this GitHub runs the site through Jekyll, which quietly drops files
# and directories whose names begin with an underscore
touch "$stage/.nojekyll"

# Write the commit into the footer, so that a page that is up says which build
# it is and links to it. This is done to the staged copy rather than to the
# repo because a commit can't contain its own hash.
#
# The separator goes in here rather than in the page so that a page with no
# commit written into it has nothing left over: the span is empty, the
# stylesheet drops it, and the source link above ends where it should.
#
# It opens in a new tab like the links beside it. The project being edited
# lives in this page's URL, so following a link out of the page takes the
# unsaved track with it.
readonly COMMIT_MARKER='<!--commit-->'

grep -q "$COMMIT_MARKER" "$stage/index.html" ||
    fail "index.html has no '$COMMIT_MARKER' for the commit to go in."

# The separator is the character itself rather than the &middot; the page uses
# elsewhere, because '&' means "everything that matched" on the replacement
# side of a sed script: an entity written here would come back as the marker it
# was meant to replace. The file is UTF-8 and says so, so the character is no
# worse off than the entity would be.
if [ -n "$commit_url" ]; then
    commit_html="· <a href=\"$commit_url\" target=\"_blank\" rel=\"noopener\">$source_commit</a>"
else
    commit_html="· $source_commit"
fi

sed "s|$COMMIT_MARKER|$commit_html|" "$stage/index.html" > "$stage/index.html.new" ||
    fail "could not write the commit into index.html."

mv "$stage/index.html.new" "$stage/index.html"

grep -q "$source_commit" "$stage/index.html" ||
    fail "the commit did not make it into index.html."

num_files=$(find "$stage" -type f | wc -l | tr -d ' ')
total_size=$(du -sh "$stage" | cut -f1 | tr -d ' ')

echo
echo "  from:     $source_commit ($source_subject)"
echo "  to:       $remote_url [$PUBLISH_BRANCH]"
echo "  contents: $num_files files, $total_size"
echo "  url:      $site_url"
echo

if [ "$dry_run" = true ]; then
    echo 'Dry run, nothing was pushed. Files that would be published:'
    (cd "$stage" && find . -type f | sed 's#^\./#    #' | sort | head -20)

    if [ "$num_files" -gt 20 ]; then
        echo "    ... and $((num_files - 20)) more"
    fi

    exit 0
fi

if [ "$assume_yes" != true ]; then
    if [ ! -t 0 ]; then
        fail "not running interactively. Pass --yes to publish without confirming."
    fi

    read -r -p "Publish, replacing $PUBLISH_BRANCH? [y/N] " reply
    case "$reply" in
        [yY]|[yY][eE][sS]) ;;
        *) echo 'Nothing was published.'; exit 1 ;;
    esac
fi

# Build the branch in the staging directory rather than in the repo, so that
# nothing here can leave the repo on another branch or with a dirty index if
# it fails partway
git -C "$stage" init -q -b "$PUBLISH_BRANCH" || fail "could not stage the branch."

# The identity of whoever is publishing, taken from the repo so that the
# throwaway one doesn't have to have git configured separately
user_name=$(git config user.name || echo 'groovie publish script')
user_email=$(git config user.email || echo 'publish@localhost')

git -C "$stage" config user.name "$user_name"
git -C "$stage" config user.email "$user_email"

git -C "$stage" add -A || fail "could not stage the site."
git -C "$stage" commit -q -m "Publish $source_commit

$source_subject" || fail "could not commit the site."

echo "Pushing to $PUBLISH_BRANCH..."

git -C "$stage" push -q --force "$remote_url" "$PUBLISH_BRANCH" ||
    fail "could not push to $PUBLISH_BRANCH."

echo
echo "Published $source_commit to $PUBLISH_BRANCH."
echo "It should be live at $site_url shortly."
echo
echo "If this is the first publish, switch Pages on under"
echo "  $settings_url"
echo "with the source set to the $PUBLISH_BRANCH branch and the / (root) folder."
