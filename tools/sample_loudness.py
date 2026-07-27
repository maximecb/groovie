#!/usr/bin/env python3

# Reports how loud every sample under samples/ is, loudest first, so that the
# ones that sit too far below the rest can be found and adjusted.
#
# Loudness is the maximum momentary loudness of ITU-R BS.1770 / EBU R128, in
# LUFS: the signal is K-weighted, which discounts low frequencies the way
# hearing does, and the loudest 400 ms window of it is what gets reported.
#
# Peak level is not a useful measure here, since the samples are already peak
# normalized: what makes one sound fainter than another is how much energy is
# behind the peak, not the peak itself. Plain RMS isn't either, because it
# rates a kick far louder than a hi-hat that sounds just as loud.
#
# The peak column is reported alongside anyway, since it says how much room a
# sample has left to be turned up before it would need limiting.

import math
import os
import sys
import wave

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = "samples"

# Momentary loudness is measured over a 400 ms window, moved along in steps of
# 100 ms, i.e. windows overlapping by 75%
WINDOW_SECS = 0.4
HOP_SECS = 0.1

# Loudness of a silent window, which is what a sample of digital silence
# reports rather than negative infinity
SILENCE_LUFS = -120.0


def k_weight_coeffs(rate):
    """Biquad coefficients of the two BS.1770 K-weighting stages.

    The standard tabulates these for 48 kHz only, so they're derived here for
    whatever rate the sample is at, from the filter parameters the standard
    gives. Each stage is returned as (b0, b1, b2, a1, a2), normalized so that
    a0 is 1.
    """
    # First stage: the shelving filter accounting for the acoustic effect of
    # the head
    f0 = 1681.974450955533
    gain_db = 3.999843853973347
    q = 0.7071752369554196

    k = math.tan(math.pi * f0 / rate)
    vh = math.pow(10.0, gain_db / 20.0)
    vb = math.pow(vh, 0.4996667741545416)

    a0 = 1.0 + k / q + k * k
    shelf = (
        (vh + vb * k / q + k * k) / a0,
        2.0 * (k * k - vh) / a0,
        (vh - vb * k / q + k * k) / a0,
        2.0 * (k * k - 1.0) / a0,
        (1.0 - k / q + k * k) / a0,
    )

    # Second stage: the high-pass that rolls off the low end
    f0 = 38.13547087602444
    q = 0.5003270373238773

    k = math.tan(math.pi * f0 / rate)
    a0 = 1.0 + k / q + k * k
    high_pass = (
        1.0,
        -2.0,
        1.0,
        2.0 * (k * k - 1.0) / a0,
        (1.0 - k / q + k * k) / a0,
    )

    return shelf, high_pass


def biquad(x, coeffs):
    """Apply one biquad section to a signal, as a direct form I difference
    equation."""
    b0, b1, b2, a1, a2 = coeffs

    x1 = x2 = y1 = y2 = 0.0
    out = []

    for x0 in x:
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out.append(y0)
        x2, x1 = x1, x0
        y2, y1 = y1, y0

    return out


def read_wav(path):
    """Return the samples of a mono wav file as floats in [-1, 1), along with
    its sample rate."""
    with wave.open(path, "rb") as f:
        rate = f.getframerate()
        width = f.getsampwidth()
        channels = f.getnchannels()
        frames = f.readframes(f.getnframes())

    if channels != 1 or width != 2:
        raise ValueError(f"expected 16-bit mono, got {8 * width}-bit "
                         f"{channels}-channel")

    # Signed 16-bit little-endian, which is the one format the samples are in.
    # Run tools/check_samples.py to find any that aren't.
    x = []
    for i in range(0, len(frames), 2):
        v = frames[i] | (frames[i + 1] << 8)
        if v >= 0x8000:
            v -= 0x10000
        x.append(v / 32768.0)

    return x, rate


def max_momentary_lufs(x, rate):
    """Loudness of the loudest 400 ms window of a signal, in LUFS."""
    shelf, high_pass = k_weight_coeffs(rate)
    z = biquad(biquad(x, shelf), high_pass)

    window = int(round(WINDOW_SECS * rate))
    hop = int(round(HOP_SECS * rate))

    # A sample shorter than one window is measured as that window's worth of
    # signal, i.e. the silence it's padded with counts against it. That's what
    # the metric says a short sound is worth, and every short sample is
    # measured the same way, so they stay comparable.
    if len(z) < window:
        z = z + [0.0] * (window - len(z))

    # Running sum of the squared signal, so that the energy of a window is one
    # subtraction rather than a pass over the window. Windows overlap by 75%,
    # which would otherwise mean squaring every sample four times over.
    sums = [0.0]
    for v in z:
        sums.append(sums[-1] + v * v)

    # A trailing partial window is dropped rather than padded, the way a
    # loudness meter only reports a window once it has filled
    peak_mean_sq = 0.0
    for start in range(0, len(z) - window + 1, hop):
        mean_sq = (sums[start + window] - sums[start]) / window
        peak_mean_sq = max(peak_mean_sq, mean_sq)

    if peak_mean_sq <= 0.0:
        return SILENCE_LUFS

    # The offset is what puts a K-weighted signal on the LUFS scale. There is
    # one channel, weighted 1.0, so it doesn't appear in the sum.
    return -0.691 + 10.0 * math.log10(peak_mean_sq)


def peak_dbfs(x):
    """Peak level of a signal, in dB relative to full scale."""
    peak = max((abs(v) for v in x), default=0.0)

    if peak <= 0.0:
        return SILENCE_LUFS

    return 20.0 * math.log10(peak)


def main():
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
    for path in sorted(paths):
        try:
            x, rate = read_wav(path)
        except (wave.Error, EOFError, ValueError) as e:
            print(f"Error: {path}: {e}")
            return 1

        rows.append((
            os.path.relpath(path, SAMPLES_DIR),
            max_momentary_lufs(x, rate),
            peak_dbfs(x),
            1000.0 * len(x) / rate,
        ))

    if not rows:
        print(f"No wav files found under '{SAMPLES_DIR}'.")
        return 1

    rows.sort(key=lambda row: row[1], reverse=True)

    name_width = max(len(row[0]) for row in rows)
    print(f"{'sample':{name_width}}  {'LUFS':>7}  {'peak dB':>7}  {'ms':>6}")

    for name, lufs, peak, dur_ms in rows:
        print(f"{name:{name_width}}  {lufs:7.1f}  {peak:7.1f}  {dur_ms:6.0f}")

    # The median is the level the library sits at, which is the useful thing to
    # compare a faint sample against
    levels = sorted(row[1] for row in rows)
    median = levels[len(levels) // 2]

    print()
    print(f"{len(rows)} samples, loudest {levels[-1]:.1f} LUFS, "
          f"median {median:.1f} LUFS, faintest {levels[0]:.1f} LUFS "
          f"({levels[-1] - levels[0]:.1f} dB spread)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
