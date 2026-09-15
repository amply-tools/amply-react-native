#!/usr/bin/env bash
#
# Every control the sample spec requires must exist in every sample that claims the
# platform, tagged with its manifest id. Nothing else notices when one of them is missing.
#
# The six Amply samples are six copies of the same screen, and they drifted because
# copy-paste has no compiler. In the KMP repo, `ios-spm-sample/HomeViewController.swift`
# reached 886 lines while its CocoaPods twin sat at 566 — the same screen, forked and then
# edited on one side only, with `GateDemo.swift` existing in exactly one of them. Both
# projects built clean the whole time. Nobody noticed, because nothing checked. The two RN
# examples here forked the same way: `bare/src/hooks/useAmplyDemo.ts` and
# `expo/src/hooks/useAmplyDemo.ts` are two copies of one hook, and `bare` still imports the
# SDK under a legacy alias no integrator would type.
#
# This is that check. It greps each example's own sources for every manifest id required on
# the `rn` column and fails naming the id, the example, and where it looked. It is a parity
# check, not a UI test: it answers "is this control present in this sample", which is the
# only question consistency actually turns on.
#
# Spec:     multiplatform-library-template/samples/SAMPLE_APP_SPEC.md   (canonical, KMP repo)
# Manifest: example/sample-manifest.txt   (verbatim copy of the KMP repo's canonical file;
#                                          this script diffs the two when both are present)
#
# Usage: bash scripts/check-sample-parity.sh
set -uo pipefail

cd "$(dirname "$0")/.."

MANIFEST="example/sample-manifest.txt"
SPEC_PATH="multiplatform-library-template/samples/SAMPLE_APP_SPEC.md"

if [ ! -f "$MANIFEST" ]; then
  echo "check-sample-parity: FAIL — missing $MANIFEST" >&2
  exit 1
fi

# Quote characters an id can be wrapped in: JSX uses ", JS also uses ' and ` for template
# literals. The id literal must sit next to `testID` on one line.
Q="[\"'\`]"

# ---------------------------------------------------------------------------------------
# The canonical copy. The manifest lives in the KMP repo; this repo carries a duplicate
# because it is published to npm and mirrored publicly and so cannot depend on a sibling
# checkout existing. Duplication that nothing checks is drift with extra steps, so: when
# the KMP repo is reachable, diff it and fail on any difference. When it is not, say so
# loudly and print the revision, so a stale copy shows up in the output instead of passing
# silently.
# ---------------------------------------------------------------------------------------
revision=$(grep -m1 '^# revision:' "$MANIFEST" | sed 's/^# revision:[[:space:]]*//')
if [ -z "$revision" ]; then
  echo "check-sample-parity: FAIL — $MANIFEST has no '# revision:' header" >&2
  exit 1
fi

peer=""
for candidate in \
  "${AMPLY_SAMPLE_MANIFEST_PEER:-}" \
  "../multiplatform-library-template/samples/sample-manifest.txt"
do
  [ -n "$candidate" ] && [ -f "$candidate" ] && { peer="$candidate"; break; }
done

if [ -n "$peer" ]; then
  if ! diff -u "$peer" "$MANIFEST" > /tmp/check-sample-parity-peer.diff 2>&1; then
    echo "check-sample-parity: FAIL — this repo's manifest copy has diverged from the canonical one." >&2
    echo "                     canonical: $peer" >&2
    echo "                     copy:      $MANIFEST" >&2
    sed 's/^/                     /' /tmp/check-sample-parity-peer.diff >&2
    rm -f /tmp/check-sample-parity-peer.diff
    exit 1
  fi
  rm -f /tmp/check-sample-parity-peer.diff
  peer_state="verified byte-identical against $peer"
else
  peer_state="NOT VERIFIED — the KMP repo was not found; set AMPLY_SAMPLE_MANIFEST_PEER to check it"
fi

# ---------------------------------------------------------------------------------------
# Parse the manifest into: id <TAB> android <TAB> ios <TAB> rn <TAB> note
# ---------------------------------------------------------------------------------------
rows=$(
  awk -F'|' '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    NF < 4 { next }
    {
      for (i = 1; i <= NF; i++) { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $i) }
      note = (NF >= 5) ? $5 : ""
      print $1 "\t" $2 "\t" $3 "\t" $4 "\t" note
    }
  ' "$MANIFEST"
)

if [ -z "$rows" ]; then
  echo "check-sample-parity: FAIL — parsed zero rows from $MANIFEST; the parser is broken" >&2
  exit 1
fi

row_count=$(printf '%s\n' "$rows" | wc -l | tr -d ' ')

# ---------------------------------------------------------------------------------------
# The examples. Each one searches its own sources plus the shared UI module. An absent root
# is skipped rather than fatal; an example with NO existing root at all is fatal, because
# that means this list is stale.
#
# The shared module is on BOTH examples' search paths, and that is a trap this check walks
# into unless it is told not to. A control id living in example/shared satisfies the grep
# for bare and expo alike — including for a host that never imports the module and still
# renders its own old screen. That is not hypothetical: on the day the shared module landed,
# `expo` reported "all 40 required controls present" while app/index.tsx was still building
# its own ScrollView out of useAmplyDemo. Green, and completely wrong.
#
# The native samples do not have this hole. Both Xcode projects list ../ios-shared/Sources
# and both Gradle modules include the shared srcDir, so on those platforms presence in the
# shared source IS compilation into the target. Metro resolving a package is not the same
# claim: a module on the search path is only rendered if something imports it.
#
# So each RN host must also prove it MOUNTS the shared module. `mount` below is a file that
# must exist and must import SHARED_PKG. Without this, the consolidation can be reported
# complete while half of it was never wired.
# ---------------------------------------------------------------------------------------
SHARED_PKG="@amply/sample-shared"
samples=(
  "bare|example/bare/src example/shared|example/bare/src/App.tsx"
  "expo|example/expo/app example/expo/src example/expo/components example/shared|example/expo/app/index.tsx"
)

ATTR="testID"
INCLUDES="--include=*.ts --include=*.tsx --include=*.js --include=*.jsx"

fail=0
checked_total=0

echo "check-sample-parity: manifest revision $revision — $row_count rows"
echo "                     peer copy: $peer_state"
echo

for entry in "${samples[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  roots="${rest%%|*}"
  mount="${rest#*|}"

  existing_roots=""
  for r in $roots; do
    [ -d "$r" ] && existing_roots="$existing_roots $r"
  done

  if [ -z "$existing_roots" ]; then
    echo "check-sample-parity: FAIL — example '$name' has no source root on disk (looked in: $roots)" >&2
    echo "                     the sample list in this script is stale." >&2
    fail=1
    continue
  fi

  # Does this host actually MOUNT the shared module, or does it merely have it on a search
  # path? Only the second is true of a host still rendering its own screen, and the id grep
  # below cannot tell the difference — every shared id would satisfy it either way.
  if [ -d "example/shared" ]; then
    if [ ! -f "$mount" ]; then
      echo "check-sample-parity: FAIL — example '$name' has no entry point at $mount" >&2
      echo "                     the mount path in this script is stale." >&2
      fail=1
      continue
    fi
    if ! grep -qF "$SHARED_PKG" "$mount"; then
      echo "check-sample-parity: FAIL — example '$name' does not mount the shared UI module." >&2
      echo "                     $mount never imports $SHARED_PKG, so this example still" >&2
      echo "                     renders its own screen. Every control id below would be" >&2
      echo "                     satisfied by example/shared regardless — a green that means" >&2
      echo "                     nothing. Mount the shared module in $mount." >&2
      fail=1
      continue
    fi
  fi

  missing=()
  unbound=()
  required=0

  while IFS=$'\t' read -r id android ios rn note; do
    [ "$rn" = "x" ] || continue
    required=$((required + 1))

    id_esc=$(printf '%s' "$id" | sed 's/[.[\*^$()+?{}|\\]/\\&/g')

    case "$note" in
      launcharg:*)
        # Not a UI control — the launch key just has to appear in the source. On RN the
        # transport is a deeplink query param rather than a launch argument (neither
        # example can read one without a new native dependency); the key spelling is the
        # same, which is why one manifest row covers all three platforms.
        # shellcheck disable=SC2086
        if ! grep -RIlE $INCLUDES -e "$id_esc" $existing_roots > /dev/null 2>&1; then
          missing+=("$id")
        fi
        continue
        ;;
      prefix:*) pattern="${Q}${id_esc}\\." ;;
      *)        pattern="${Q}${id_esc}${Q}" ;;
    esac

    # shellcheck disable=SC2086
    hits=$(grep -RInE $INCLUDES -e "$pattern" $existing_roots 2>/dev/null)
    if [ -z "$hits" ]; then
      missing+=("$id")
      continue
    fi
    if ! printf '%s\n' "$hits" | grep -q "$ATTR"; then
      unbound+=("$id")
    fi
  done <<< "$rows"

  checked_total=$((checked_total + required))

  if [ ${#missing[@]} -eq 0 ] && [ ${#unbound[@]} -eq 0 ]; then
    echo "  OK   $name (rn) — all $required required controls present"
    continue
  fi

  fail=1
  echo "  FAIL $name (rn) — $((${#missing[@]} + ${#unbound[@]})) of $required required controls not satisfied"
  echo "       searched:$existing_roots"
  if [ ${#missing[@]} -gt 0 ]; then
    echo "       missing (${#missing[@]}):"
    for id in "${missing[@]}"; do echo "         - $id"; done
  fi
  if [ ${#unbound[@]} -gt 0 ]; then
    echo "       present but not on a line with \`$ATTR\` (${#unbound[@]}):"
    for id in "${unbound[@]}"; do echo "         - $id"; done
  fi
  echo
done

# ---------------------------------------------------------------------------------------
# Retired ids: controls that were required once and must NOT come back. A presence-only
# check cannot see a control that should have been deleted, so without this a removal is
# held together by trust. Failed on sight, wherever they appear.
# ---------------------------------------------------------------------------------------
retired_ids=$(grep -E '^# +retired: +amply\.' "$MANIFEST" | sed -E 's/^# +retired: +([^ ]+).*/\1/')
for rid in $retired_ids; do
  rid_esc=$(printf '%s' "$rid" | sed 's/[.[\*^$()+?{}|\\]/\\&/g')
  # shellcheck disable=SC2086
  retired_roots=""
  for r in example/bare/src example/expo/app example/expo/src example/expo/components example/shared; do [ -d "$r" ] && retired_roots="$retired_roots $r"; done
  # shellcheck disable=SC2086
  hits=$(grep -RIlE --include=*.ts --include=*.tsx --include=*.js --include=*.jsx -e "${Q}${rid_esc}${Q}" $retired_roots 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "check-sample-parity: FAIL — retired control '$rid' is still in the source:" >&2
    printf '                       %s\n' $hits >&2
    echo "                     It was deliberately removed; see the manifest's Retired block." >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "check-sample-parity: FAIL" >&2
  echo "                     Each missing id is a control $SPEC_PATH requires and the example" >&2
  echo "                     does not have. Tag the real widget with it: testID=\"<id>\"." >&2
  exit 1
fi

echo "check-sample-parity: OK — manifest revision $revision, $checked_total control checks across ${#samples[@]} examples."
