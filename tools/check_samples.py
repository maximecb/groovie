#!/usr/bin/env python3

# Checks that every sample under samples/ is a 44.1 kHz, 16-bit mono PCM wav
# file, the one format the audio engine is built around.
#
# Run tools/convert_samples.sh to convert any offending file in place.
#
# Also checks sample_list.js against the samples on disk: every sample must
# have an index, every index must have a sample, and the indices must be dense
# (0 to n-1, no gaps and no duplicates). audio.js indexes its sample arrays by
# these values, so a gap would leave an undefined hole in them.
#
# Run tools/update_samples.py to list any samples that are new on disk. Note
# that deleting a sample cannot be fixed that way: update_samples.py keeps the
# name as a reserved entry to hold its index, which this check then reports as
# a sample missing from disk. Deleting a sample means either restoring the
# file, or renumbering with --reuse and accepting that every song shared before
# the renumbering now plays back with the wrong samples.

import os
import sys
import wave

from update_samples import SAMPLE_LIST_PATH, parse_existing_map

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = "samples"

CHANNELS = 1
SAMPLE_RATE = 44100
SAMPLE_WIDTH = 2  # bytes, i.e. 16-bit


def check_wav(path):
    """Return a list of problems found with a single wav file."""
    try:
        with wave.open(path, "rb") as f:
            channels = f.getnchannels()
            sample_rate = f.getframerate()
            sample_width = f.getsampwidth()
            comp_type = f.getcomptype()
    except (wave.Error, EOFError) as e:
        return [f"could not be read as a wav file: {e}"]

    problems = []
    if comp_type != "NONE":
        problems.append(f"is compressed ({comp_type}), expected uncompressed PCM")
    if channels != CHANNELS:
        problems.append(f"has {channels} channels, expected {CHANNELS}")
    if sample_rate != SAMPLE_RATE:
        problems.append(f"is {sample_rate} Hz, expected {SAMPLE_RATE} Hz")
    if sample_width != SAMPLE_WIDTH:
        problems.append(f"is {8 * sample_width}-bit, expected {8 * SAMPLE_WIDTH}-bit")

    return problems


def check_sample_list(wav_paths):
    """Return a list of problems found with sample_list.js.

    Takes the sample paths found on disk, and checks that the list covers
    exactly those paths with a dense range of indices.
    """
    if not os.path.exists(SAMPLE_LIST_PATH):
        return [f"{SAMPLE_LIST_PATH} does not exist"]

    sample_map = parse_existing_map(SAMPLE_LIST_PATH)
    if not sample_map:
        return [f"{SAMPLE_LIST_PATH} has no entries, or is in an "
                f"unrecognized format"]

    problems = []

    on_disk = set(wav_paths)
    for path in sorted(on_disk - set(sample_map)):
        problems.append(f"{path} is on disk but missing from "
                        f"{SAMPLE_LIST_PATH}")
    for path in sorted(set(sample_map) - on_disk):
        problems.append(f"{path} is in {SAMPLE_LIST_PATH} (index "
                        f"{sample_map[path]}) but missing from disk")

    # Duplicates are reported separately from gaps: both make the index set
    # smaller than the entry count, but they need different fixes.
    indices = sorted(sample_map.values())
    seen = set()
    for index in indices:
        if index in seen:
            names = sorted(n for n in sample_map if sample_map[n] == index)
            problems.append(f"index {index} is used by several samples: "
                            f"{', '.join(names)}")
        seen.add(index)

    missing = sorted(set(range(len(sample_map))) - seen)
    if missing:
        problems.append(f"indices are not dense, unused: "
                        f"{', '.join(str(i) for i in missing)}")

    return problems


def main():
    # Paths are relative to the repo root, so the script can be run from
    # anywhere.
    os.chdir(ROOT_DIR)

    if not os.path.isdir(SAMPLES_DIR):
        print(f"Error: '{SAMPLES_DIR}' directory does not exist.")
        return 1

    wav_paths = []
    stray_paths = []
    for root, dirs, files in os.walk(SAMPLES_DIR):
        for file in sorted(files):
            path = os.path.join(root, file)
            if file.endswith(".wav"):
                wav_paths.append(path)
            elif file != ".DS_Store":
                stray_paths.append(path)

    failures = 0

    for path in stray_paths:
        print(f"FAIL {path}: is not a wav file")
        failures += 1

    for path in sorted(wav_paths):
        problems = check_wav(path)
        if problems:
            failures += 1
            for problem in problems:
                print(f"FAIL {path}: {problem}")

    print(f"Checked {len(wav_paths)} wav files, {failures} problem(s) found.")

    if failures:
        print("Run tools/convert_samples.sh to convert samples to the correct "
              "format.")

    list_problems = check_sample_list(wav_paths)

    for problem in list_problems:
        print(f"FAIL {SAMPLE_LIST_PATH}: {problem}")

    print(f"Checked {SAMPLE_LIST_PATH}, {len(list_problems)} problem(s) "
          f"found.")

    if list_problems:
        print("Run tools/update_samples.py to add any new samples to the "
              "list. A sample missing from disk has to be restored instead: "
              "renumbering the list around it would break shared songs.")

    if failures or list_problems:
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
