#!/usr/bin/env python3

# Regenerates sample_list.js, the definitive map of sample names to sample
# indices.
#
# The key invariant is that a given sample name always keeps the same index,
# even across additions and deletions. Song exports encode samples by index,
# so a changing index would silently corrupt previously shared songs.
#
# To uphold this:
#   - Existing names keep the index recorded in sample_list.js.
#   - New samples on disk are assigned fresh indices (max existing index + 1,
#     onward), in alphabetical order.
#   - Names that have disappeared from disk are kept as reserved entries so
#     their index is never handed out to a different sample. If the sample
#     ever comes back, it reclaims its original index.
#
# The --reuse flag deliberately breaks that invariant: it drops the reserved
# entries and renumbers every sample from 0 in alphabetical order, so the
# indices are dense again. Any song exported before the renumbering will play
# back with the wrong samples, so this is only safe while no shared songs are
# in the wild.

import argparse
import os
import re

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLE_LIST_PATH = "sample_list.js"
SAMPLES_DIR = "samples"


def find_samples_on_disk():
    """Return the sorted list of sample paths currently on disk."""
    paths = []
    for root, dirs, files in os.walk(SAMPLES_DIR):
        for file in files:
            if file.endswith(".wav"):
                paths.append(os.path.join(root, file))
    return sorted(paths)


def parse_existing_map(path):
    """Parse sample_list.js into a {name: index} dict.

    Matches lines of the form  'name': index  (single or double quotes).
    Returns an empty dict if the file is absent or in an older format, which
    is fine: the samples on disk will then be indexed from scratch.
    """
    if not os.path.exists(path):
        return {}

    with open(path) as f:
        text = f.read()

    entry = re.compile(r"""['"]([^'"]+)['"]\s*:\s*(\d+)""")
    return {name: int(index) for name, index in entry.findall(text)}


def build_map(existing, on_disk):
    """Merge the on-disk samples into the existing name->index map.

    Existing indices are preserved, deleted samples stay reserved, and new
    samples get the next free indices in alphabetical order.
    """
    sample_map = dict(existing)
    next_index = max(existing.values(), default=-1) + 1

    for name in on_disk:
        if name not in sample_map:
            sample_map[name] = next_index
            next_index += 1

    return sample_map


def build_compact_map(on_disk):
    """Number the on-disk samples from 0, in alphabetical order.

    Reserved entries are dropped and existing indices are not preserved, so
    the resulting map is dense.
    """
    return {name: index for index, name in enumerate(on_disk)}


def write_map(path, sample_map):
    lines = ["export const SAMPLE_MAP = {"]
    for name in sorted(sample_map):
        lines.append(f"    '{name}': {sample_map[name]},")
    lines.append("};\n")

    with open(path, "w") as f:
        f.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reuse",
        action="store_true",
        help="renumber all samples from 0 in alphabetical order, dropping "
             "reserved indices. Breaks songs exported before the renumbering.")
    args = parser.parse_args()

    # Paths are relative to the repo root, so the script can be run from
    # anywhere.
    os.chdir(ROOT_DIR)

    existing = parse_existing_map(SAMPLE_LIST_PATH)
    on_disk = find_samples_on_disk()

    if args.reuse:
        sample_map = build_compact_map(on_disk)
    else:
        sample_map = build_map(existing, on_disk)

    on_disk_set = set(on_disk)
    added = sorted(n for n in on_disk_set if n not in existing)
    reserved = sorted(n for n in sample_map if n not in on_disk_set)
    dropped = sorted(n for n in existing if n not in sample_map)
    moved = sorted(n for n in sample_map
                   if n in existing and existing[n] != sample_map[n])

    write_map(SAMPLE_LIST_PATH, sample_map)

    print(f"{len(sample_map)} samples in {SAMPLE_LIST_PATH} "
          f"({len(on_disk)} on disk)")
    for name in added:
        print(f"  added:    {name} -> {sample_map[name]}")
    for name in reserved:
        print(f"  reserved: {name} -> {sample_map[name]} (missing from disk)")
    for name in dropped:
        print(f"  dropped:  {name} (was {existing[name]})")
    for name in moved:
        print(f"  moved:    {name} {existing[name]} -> {sample_map[name]}")

    if moved or dropped:
        print("\nIndices changed: songs exported before now will play back "
              "with the wrong samples.")


if __name__ == "__main__":
    main()
