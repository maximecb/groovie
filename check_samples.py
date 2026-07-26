#!/usr/bin/env python3

# Checks that every sample under samples/ is a 44.1 kHz, 16-bit mono PCM wav
# file, the one format the audio engine is built around.
#
# Run convert_samples.sh to convert any offending file in place.

import os
import sys
import wave

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


def main():
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
        print("Run ./convert_samples.sh to convert samples to the correct format.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
