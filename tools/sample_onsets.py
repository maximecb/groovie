#!/usr/bin/env python3

# Reports how long every sample under samples/ takes to start, latest first, so
# that the ones that begin with dead air can be found and trimmed.
#
# Leading silence matters because samples are triggered on the beat: whatever
# quiet stretch sits at the head of the file becomes a delay between the beat
# and the sound, and a sample that starts 20 ms late plays audibly behind the
# rest of the pattern.
#
# Four measures are reported, because "silence" at the head of a file comes in
# different forms and they suggest different fixes:
#
#   onset  Time until the signal first rises within ONSET_REL_DB of its loudest
#          point, measured on a short running RMS envelope. This is the main
#          number: it is relative to the sample's own peak, so it doesn't care
#          how loud the sample is, and the envelope keeps a lone stray blip
#          from counting as the start of the sound.
#   quiet  Time until the first sample above QUIET_FLOOR_DB of full scale. A
#          per-sample measure, so unlike the onset it does trip on a single
#          stray blip. When quiet is much shorter than onset, the file starts
#          with something too faint to hear rather than with true silence.
#   zeros  Leading run of exact zeros, i.e. silence that can be cut with no
#          effect whatsoever on the sound.
#   peak   Time to the loudest single sample. A sample can start on time and
#          still hit late if it fades in, which a late peak against an early
#          onset shows up as.
#
# Only onset is compared against the threshold, since it's the one that tracks
# what a listener would call the start of the sound.
#
# Samples whose very first value is nonzero are left out of the report, since
# they carry no dead air at the head of the file: whatever makes them slow to
# start is part of the sound, and cutting into it would cut into the sound
# itself. Pass --all to list them too.

import argparse
import math
import os
import sys
import wave

from sample_loudness import read_wav

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = "samples"

# Onset counts from where the envelope first comes within this many dB of its
# maximum. Low enough to catch the quiet leading edge of a soft attack, high
# enough to sit above the noise floor of a sample that was recorded rather
# than synthesized.
ONSET_REL_DB = 40.0

# Length of the RMS window the envelope is measured over. The window looks
# ahead of the position it reports, so that the envelope rises at the start of
# a transient rather than one window later.
ENVELOPE_SECS = 0.002

# What counts as near-silence for the per-sample 'quiet' measure, in dB
# relative to full scale
QUIET_FLOOR_DB = -60.0

# Onset beyond which a sample is flagged, in milliseconds
DEFAULT_THRESHOLD_MS = 5.0


def rms_envelope(x, window):
    """Return the RMS of each window-long stretch of a signal.

    Entry i covers x[i:i + window], so the envelope rises as a transient
    starts rather than after it. The last window-1 entries cover what is left
    of the signal, which is shorter, and so are not comparable to the rest;
    they only exist so that a sample shorter than one window still has an
    envelope.
    """
    # Running sum of the squared signal, so each window costs one subtraction
    # instead of a pass over the window
    sums = [0.0]
    for v in x:
        sums.append(sums[-1] + v * v)

    env = []
    for start in range(len(x)):
        end = min(start + window, len(x))
        env.append(math.sqrt((sums[end] - sums[start]) / (end - start)))

    return env


def onset_secs(x, rate):
    """Time until the signal first rises within ONSET_REL_DB of its peak."""
    window = max(1, int(round(ENVELOPE_SECS * rate)))
    env = rms_envelope(x, window)

    peak_env = max(env, default=0.0)
    if peak_env <= 0.0:
        return None

    threshold = peak_env * math.pow(10.0, -ONSET_REL_DB / 20.0)

    for i, v in enumerate(env):
        if v >= threshold:
            return i / rate

    # Unreachable: the maximum of the envelope is itself above the threshold
    return None


def quiet_secs(x, rate):
    """Time until the first sample above the near-silence floor."""
    floor = math.pow(10.0, QUIET_FLOOR_DB / 20.0)

    for i, v in enumerate(x):
        if abs(v) >= floor:
            return i / rate

    return None


def zeros_secs(x, rate):
    """Length of the leading run of exact zeros."""
    for i, v in enumerate(x):
        if v != 0.0:
            return i / rate

    return None


def peak_secs(x, rate):
    """Time to the loudest single sample."""
    peak = max((abs(v) for v in x), default=0.0)
    if peak <= 0.0:
        return None

    for i, v in enumerate(x):
        if abs(v) >= peak:
            return i / rate

    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD_MS,
        metavar="MS",
        help=f"onset beyond which a sample is flagged, in milliseconds "
             f"(default {DEFAULT_THRESHOLD_MS})")
    parser.add_argument(
        "--all",
        action="store_true",
        help="also list samples that are already nonzero at the very first "
             "value, i.e. that have no leading silence to trim")
    args = parser.parse_args()

    # Paths are relative to the repo root, so the script can be run from
    # anywhere.
    os.chdir(ROOT_DIR)

    if not os.path.isdir(SAMPLES_DIR):
        print(f"Error: '{SAMPLES_DIR}' directory does not exist.")
        return 1

    paths = []
    for root, dirs, files in os.walk(SAMPLES_DIR):
        for file in sorted(files):
            if file.endswith(".wav"):
                paths.append(os.path.join(root, file))

    rows = []
    skipped = 0
    for path in sorted(paths):
        try:
            x, rate = read_wav(path)
        except (wave.Error, EOFError, ValueError) as e:
            print(f"Error: {path}: {e}")
            return 1

        if not args.all and x and x[0] != 0.0:
            skipped += 1
            continue

        # A silent sample has no onset to speak of. Its measures come back as
        # None, which sorts and prints as a dash rather than as an onset of 0.
        rows.append((
            os.path.relpath(path, SAMPLES_DIR),
            onset_secs(x, rate),
            quiet_secs(x, rate),
            zeros_secs(x, rate),
            peak_secs(x, rate),
            len(x) / rate,
        ))

    if not paths:
        print(f"No wav files found under '{SAMPLES_DIR}'.")
        return 1

    if not rows:
        print(f"All {skipped} samples are nonzero at their first value, so "
              f"none has leading silence to trim. Pass --all to list them.")
        return 0

    rows.sort(key=lambda row: (row[1] is not None, row[1]), reverse=True)

    def ms(secs):
        return "-" if secs is None else f"{1000.0 * secs:.1f}"

    name_width = max(len(row[0]) for row in rows)
    print(f"{'sample':{name_width}}  {'onset':>6}  {'quiet':>6}  {'zeros':>6}  "
          f"{'peak':>6}  {'ms':>6}")

    flagged = 0
    for name, onset, quiet, zeros, peak, dur in rows:
        late = onset is not None and 1000.0 * onset > args.threshold
        flagged += late

        print(f"{name:{name_width}}  {ms(onset):>6}  {ms(quiet):>6}  "
              f"{ms(zeros):>6}  {ms(peak):>6}  {1000.0 * dur:6.0f}"
              f"{'  <-- late' if late else ''}")

    silent = sum(1 for row in rows if row[1] is None)
    onsets = sorted(1000.0 * row[1] for row in rows if row[1] is not None)

    print()
    print(f"{len(rows)} samples, {flagged} with an onset over "
          f"{args.threshold:.1f} ms")

    if skipped:
        print(f"{skipped} sample(s) not listed: nonzero at their first value, "
              f"so no leading silence to trim (--all lists them)")

    if onsets:
        print(f"onset median {onsets[len(onsets) // 2]:.1f} ms, "
              f"latest {onsets[-1]:.1f} ms")
    if silent:
        print(f"{silent} sample(s) are entirely silent")

    return 0


if __name__ == "__main__":
    sys.exit(main())
