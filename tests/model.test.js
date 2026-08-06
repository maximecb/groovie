// Tests for the project state in model.js: patterns, the project holding them,
// and the timeline. The URL encoding is tested separately, in encoding.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";

import { drain_asserts } from "./setup.js";

import {
    Pattern,
    Project,
    MIN_TEMPO,
    MAX_TEMPO,
    DEFAULT_TEMPO,
    MIN_SWING,
    MAX_SWING,
    DEFAULT_SWING,
    MIN_HUMANIZE,
    MAX_HUMANIZE,
    DEFAULT_HUMANIZE,
    HUMANIZE_MAX_TIME,
    HUMANIZE_MAX_GAIN,
    MIN_PAN,
    MAX_PAN,
    DEFAULT_PAN,
    MIN_VOLUME,
    MAX_VOLUME,
    DEFAULT_VOLUME,
    MIN_SEND,
    MAX_SEND,
    DEFAULT_SEND,
    MIN_DELAY_TIME,
    MAX_DELAY_TIME,
    DEFAULT_DELAY_TIME,
    MIN_DELAY_FB,
    MAX_DELAY_FB,
    MIN_FILTER,
    MAX_FILTER,
    DEFAULT_FILTER,
    MIN_RESONANCE,
    MAX_RESONANCE,
    DEFAULT_RESONANCE,
    FILTER_MIN_FREQ,
    FILTER_MAX_FREQ,
    FILTER_MIN_PEAK,
    FILTER_MAX_PEAK,
    FILTER_RESO_FADE,
    DEFAULT_DELAY_FB,
    DELAY_FB_STEP,
    DELAY_STEP_FRACTIONS,
    MIN_PAT_STEPS,
    MAX_PAT_STEPS,
    MIN_PAT_ROWS,
    MAX_PAT_ROWS,
    DEFAULT_PAT_ROWS,
    DEFAULT_PAT_STEPS,
    MAX_PATTERNS,
    MAX_SONG_STEPS,
    STEPS_PER_BAR,
    STEPS_PER_BEAT,
} from "../model.js";

//============================================================================
// Pattern
//============================================================================

test("a new pattern is empty and has the default size", () =>
{
    let pat = Pattern.with_default_samples();

    assert.equal(pat.num_rows, DEFAULT_PAT_ROWS);
    assert.equal(pat.num_steps, DEFAULT_PAT_STEPS);
    assert.ok(pat.is_inactive());
});

test("a new pattern plays a different sample on every row", () =>
{
    let pat = Pattern.with_default_samples();
    let uniq = new Set(pat.sample_idxs);

    assert.equal(uniq.size, pat.num_rows);
});

test("toggling a cell turns it on and back off", () =>
{
    let pat = Pattern.with_default_samples();

    assert.equal(pat.toggle_cell(0, 0), true);
    assert.equal(pat.get_cell(0, 0), 1);
    assert.equal(pat.toggle_cell(0, 0), false);
    assert.equal(pat.get_cell(0, 0), 0);
});

test("growing a pattern keeps its cells and leaves the new ones empty", () =>
{
    let pat = new Pattern([0, 1], 4);
    pat.toggle_cell(0, 0);
    pat.toggle_cell(1, 3);

    pat.set_num_steps(8);

    assert.equal(pat.num_steps, 8);
    assert.deepEqual(pat.rows[0], [1, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(pat.rows[1], [0, 0, 0, 1, 0, 0, 0, 0]);
});

test("shrinking a pattern keeps the cells that still fit", () =>
{
    let pat = new Pattern([0], 8);
    pat.toggle_cell(0, 1);
    pat.toggle_cell(0, 6);

    pat.set_num_steps(4);

    assert.equal(pat.num_steps, 4);
    assert.deepEqual(pat.rows[0], [0, 1, 0, 0]);
});

test("shrinking and growing again does not bring back the lost cells", () =>
{
    let pat = new Pattern([0], 8);
    pat.toggle_cell(0, 6);

    pat.set_num_steps(4);
    pat.set_num_steps(8);

    assert.deepEqual(pat.rows[0], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test("a row can be added up to the row limit and no further", () =>
{
    let pat = new Pattern([0], MIN_PAT_STEPS);

    while (pat.num_rows < MAX_PAT_ROWS)
        assert.equal(pat.add_row(pat.next_row_sample()), true);

    assert.equal(pat.num_rows, MAX_PAT_ROWS);
    assert.equal(pat.add_row(0), false);
    assert.equal(pat.num_rows, MAX_PAT_ROWS);
});

test("an added row is empty and as long as the pattern", () =>
{
    let pat = new Pattern([0], 5);
    pat.add_row(1);

    assert.equal(pat.rows[1].length, 5);
    assert.ok(pat.row_is_inactive(1));
});

test("a row can be deleted down to the last one and no further", () =>
{
    let pat = new Pattern([4, 5, 6], MIN_PAT_STEPS);

    assert.equal(pat.delete_row(1), true);
    assert.deepEqual(pat.sample_idxs, [4, 6]);

    assert.equal(pat.delete_row(0), true);
    assert.deepEqual(pat.sample_idxs, [6]);

    // A pattern always keeps a row, so the last one can't be deleted
    assert.equal(pat.delete_row(0), false);
    assert.deepEqual(pat.sample_idxs, [6]);
});

test("deleting a row takes everything belonging to it", () =>
{
    let pat = new Pattern([4, 5, 6], 2);

    pat.toggle_cell(1, 0);
    pat.set_row_pan(1, -6);
    pat.set_row_volume(1, -12);
    pat.toggle_cell(2, 1);
    pat.set_row_pan(2, 7);
    pat.set_row_volume(2, -3);

    pat.delete_row(1);

    // What was the third row is now the second, with its own cells, panning
    // and level rather than the deleted row's
    assert.equal(pat.num_rows, 2);
    assert.deepEqual(pat.sample_idxs, [4, 6]);
    assert.deepEqual(pat.rows[1], [0, 1]);
    assert.deepEqual(pat.pans, [0, 7]);
    assert.deepEqual(pat.volumes, [0, -3]);
});

test("a pattern always has a sample to hand a new row", () =>
{
    // There are as many ROW_SAMPLES as a pattern can have rows, so filling a
    // pattern up must never have to hand out a sample it already plays
    let pat = new Pattern([Pattern.with_default_samples().sample_idxs[0]], 1);

    while (pat.num_rows < MAX_PAT_ROWS)
    {
        let sample_idx = pat.next_row_sample();
        assert.ok(!pat.sample_idxs.includes(sample_idx));
        pat.add_row(sample_idx);
    }
});

test("a pattern is inactive until one of its rows has a step", () =>
{
    let pat = new Pattern([0, 1], 4);

    assert.ok(pat.is_inactive());
    assert.ok(pat.row_is_inactive(1));

    pat.toggle_cell(1, 2);

    assert.ok(!pat.is_inactive());
    assert.ok(pat.row_is_inactive(0));
    assert.ok(!pat.row_is_inactive(1));
});

test("a copied pattern does not share state with the original", () =>
{
    let pat = new Pattern([0, 1], 4);
    pat.toggle_cell(0, 0);
    pat.set_row_pan(1, -4);
    pat.set_row_volume(1, -9);

    let copy = pat.copy();
    copy.toggle_cell(0, 1);
    copy.set_row_sample(1, 7);
    copy.set_row_pan(1, MAX_PAN);
    copy.set_row_volume(1, MIN_VOLUME);

    assert.deepEqual(pat.rows[0], [1, 0, 0, 0]);
    assert.deepEqual(copy.rows[0], [1, 1, 0, 0]);
    assert.equal(pat.sample_idxs[1], 1);
    assert.equal(copy.sample_idxs[1], 7);

    // Panning and level belong to a row the way its sample does, so the copy
    // takes them along and then holds its own
    assert.deepEqual(pat.pans, [DEFAULT_PAN, -4]);
    assert.deepEqual(pat.volumes, [DEFAULT_VOLUME, -9]);
    assert.deepEqual(copy.pans, [DEFAULT_PAN, MAX_PAN]);
    assert.deepEqual(copy.volumes, [DEFAULT_VOLUME, MIN_VOLUME]);
});

test("an empty copy keeps the samples and length but none of the cells", () =>
{
    let pat = new Pattern([3, 4], 7);
    pat.toggle_cell(0, 0);

    let copy = pat.empty_copy();

    assert.deepEqual(copy.sample_idxs, [3, 4]);
    assert.equal(copy.num_steps, 7);
    assert.ok(copy.is_inactive());

    // The original keeps its cells
    assert.equal(pat.get_cell(0, 0), 1);
});

test("an empty copy keeps how the rows are mixed", () =>
{
    // Panning and level are part of the kit for the same reason the samples
    // are, so a pattern made from this one opens mixed the way this one is
    // rather than back in the centre and back up at full
    let pat = new Pattern([3, 4], 7);
    pat.set_row_pan(0, -8);
    pat.set_row_volume(1, -5);

    let copy = pat.empty_copy();

    assert.deepEqual(copy.pans, [-8, DEFAULT_PAN]);
    assert.deepEqual(copy.volumes, [DEFAULT_VOLUME, -5]);

    // Mixing the new pattern leaves the one it came from alone
    copy.set_row_pan(0, MAX_PAN);
    assert.equal(pat.pans[0], -8);
});

test("stripping a pattern drops the rows that play nothing", () =>
{
    let pat = new Pattern([10, 11, 12], 4);
    pat.toggle_cell(1, 2);

    let stripped = pat.strip_inactive();

    assert.deepEqual(stripped.sample_idxs, [11]);
    assert.deepEqual(stripped.rows, [[0, 0, 1, 0]]);

    // The pattern it was called on is left alone
    assert.equal(pat.num_rows, 3);
});

test("stripping a pattern keeps each surviving row's own mixing", () =>
{
    // The rows dropped here are not the last ones, so panning and level have
    // to travel with the row they belong to rather than stay at the index it
    // used to have. Stripping is done on the way into a link, so a row taking
    // the wrong ones would mix somebody's song differently on every open.
    let pat = new Pattern([10, 11, 12, 13], 4);

    pat.set_row_pan(0, MIN_PAN);
    pat.set_row_volume(0, -20);

    pat.toggle_cell(1, 0);
    pat.set_row_pan(1, 6);
    pat.set_row_volume(1, -12);
    pat.set_row_send(1, -9);

    pat.set_row_pan(2, MAX_PAN);
    pat.set_row_send(2, MAX_SEND);

    pat.toggle_cell(3, 2);
    pat.set_row_volume(3, MIN_VOLUME);

    let stripped = pat.strip_inactive();

    assert.deepEqual(stripped.sample_idxs, [11, 13]);
    assert.deepEqual(stripped.pans, [6, DEFAULT_PAN]);
    assert.deepEqual(stripped.volumes, [-12, MIN_VOLUME]);
    assert.deepEqual(stripped.sends, [-9, DEFAULT_SEND]);
});

test("stripping an empty pattern leaves its first row", () =>
{
    let pat = new Pattern([10, 11], 4);
    let stripped = pat.strip_inactive();

    assert.equal(stripped.num_rows, MIN_PAT_ROWS);
    assert.deepEqual(stripped.sample_idxs, [10]);
});

//============================================================================
// Row mixing
//
// A row's panning is held in tenths and its level in decibels, which is what
// the UI shows and what a link carries. The audio graph works in neither, so a
// pattern is asked to convert: see row_stereo_pan and row_gain in model.js.
// These are the only place the two scales meet, and getting one wrong changes
// how everything sounds without changing anything anyone can see.
//============================================================================

test("a row's stereo position is handed over on the scale a panner uses", () =>
{
    let pat = new Pattern([0, 1, 2, 3], MIN_PAT_STEPS);

    pat.set_row_pan(0, MIN_PAN);
    pat.set_row_pan(1, MAX_PAN);
    pat.set_row_pan(2, MAX_PAN / 2);

    // Hard over is -1 and 1, halfway over is half of that, and a row nobody
    // has touched sits in the middle
    assert.equal(pat.row_stereo_pan(0), -1);
    assert.equal(pat.row_stereo_pan(1), 1);
    assert.equal(pat.row_stereo_pan(2), 0.5);
    assert.equal(pat.row_stereo_pan(3), 0);

    // A panner takes nothing outside that range, so no position may leave it
    for (let pan = MIN_PAN; pan <= MAX_PAN; ++pan)
    {
        pat.set_row_pan(0, pan);
        assert.ok(Math.abs(pat.row_stereo_pan(0)) <= 1, `pan ${pan}`);
    }
});

test("a row's level is handed over as an amplitude", () =>
{
    let pat = new Pattern([0, 1, 2], MIN_PAT_STEPS);

    // A row nobody has touched plays the sample as it was recorded
    assert.equal(pat.row_gain(0), 1);

    // The decibels here measure amplitude rather than power: -20 dB is a tenth
    // of the amplitude and -6 dB about half of it. Halving the divisor in the
    // conversion would make every row that was turned down far quieter than
    // its label says, which nothing else here would catch.
    pat.set_row_volume(1, -20);
    assert.ok(Math.abs(pat.row_gain(1) - 0.1) < 1e-9);

    pat.set_row_volume(2, -6);
    assert.ok(Math.abs(pat.row_gain(2) - 0.5) < 0.01);
});

test("a row pulled all the way down is silent rather than very quiet", () =>
{
    // The bottom of the range is what mutes a row, so it has to come out as no
    // signal at all rather than as the -30 dB it reads as: audio.js skips a
    // cell whose gain is zero, and -30 dB is quiet but still audible in a mix.
    let pat = new Pattern([0, 1], MIN_PAT_STEPS);

    pat.set_row_volume(0, MIN_VOLUME);
    pat.set_row_volume(1, MIN_VOLUME + 1);

    assert.equal(pat.row_gain(0), 0);
    assert.ok(pat.row_gain(1) > 0);
});

test("every level in the range is quieter than the one above it", () =>
{
    // A step of a decibel is about the smallest change in level anyone can
    // hear, which is what the range is spaced on: every setting has to be a
    // different level from its neighbours, and none may be louder than the
    // sample as it was recorded.
    let pat = new Pattern([0], MIN_PAT_STEPS);
    let prev_gain = Infinity;

    for (let volume = MAX_VOLUME; volume >= MIN_VOLUME; --volume)
    {
        pat.set_row_volume(0, volume);
        let gain = pat.row_gain(0);

        assert.ok(gain < prev_gain, `${volume}dB is not below the level above it`);
        assert.ok(gain >= 0 && gain <= 1, `${volume}dB is outside the range`);

        prev_gain = gain;
    }
});

test("a row starts out dry and is handed to the delay as an amplitude", () =>
{
    let pat = new Pattern([0, 1, 2], MIN_PAT_STEPS);

    // A row nobody sent anywhere feeds the delay nothing, which is what keeps
    // a project made before there was a delay sounding the way it did
    assert.equal(pat.sends[0], DEFAULT_SEND);
    assert.equal(pat.row_send_gain(0), 0);

    // The same decibels the level is measured in, converted the same way
    pat.set_row_send(1, MAX_SEND);
    assert.equal(pat.row_send_gain(1), 1);

    pat.set_row_send(2, -20);
    assert.ok(Math.abs(pat.row_send_gain(2) - 0.1) < 1e-9);
});

test("a row sent to the bottom of its travel feeds the delay nothing", () =>
{
    // audio.js builds no send nodes for a row whose send is zero, so the
    // bottom of the range has to come out as no signal rather than as -30 dB
    let pat = new Pattern([0, 1], MIN_PAT_STEPS);

    pat.set_row_send(0, MIN_SEND);
    pat.set_row_send(1, MIN_SEND + 1);

    assert.equal(pat.row_send_gain(0), 0);
    assert.ok(pat.row_send_gain(1) > 0);
});

//============================================================================
// Project
//============================================================================

test("a new project has one empty pattern and no song", () =>
{
    let project = new Project();

    assert.equal(project.title, '');
    assert.equal(project.tempo, DEFAULT_TEMPO);
    assert.equal(project.swing, DEFAULT_SWING);
    assert.equal(project.num_patterns, 1);
    assert.equal(project.song_num_steps, 0);
});

test("the tempo sets the playback rate in steps per second", () =>
{
    let project = new Project();
    project.set_tempo(120);

    // 120 BPM is 2 beats a second, and a beat is STEPS_PER_BEAT steps
    assert.equal(project.steps_per_sec, 2 * STEPS_PER_BEAT);
});

test("the delay time is a fraction of a step and follows the tempo", () =>
{
    let project = new Project();
    project.set_tempo(120);

    // At 120 BPM a step is an eighth of a second, so a delay of one step holds
    // a sound for that long and one of four steps holds it for four of them
    let one_step = DELAY_STEP_FRACTIONS.findIndex(([n, d]) => n == 1 && d == 1);
    project.set_delay_time(one_step);
    assert.ok(Math.abs(project.delay_time_secs - 0.125) < 1e-9);

    let four_steps = DELAY_STEP_FRACTIONS.findIndex(([n, d]) => n == 4 && d == 1);
    project.set_delay_time(four_steps);
    assert.ok(Math.abs(project.delay_time_secs - 0.5) < 1e-9);

    // The delay is set in steps rather than in seconds, so playing the same
    // project twice as fast brings its echoes twice as close together
    project.set_tempo(240);
    assert.ok(Math.abs(project.delay_time_secs - 0.25) < 1e-9);
});

test("the longest delay at the slowest tempo fits the line that holds it", () =>
{
    // A DelayNode is given the longest time it can ever be asked for when it is
    // built and cannot grow afterwards (see MAX_DELAY_SECS in audio.js). The
    // worst case is the longest setting at the slowest tempo, and a setting
    // past what the line holds would come out silently clamped.
    let project = new Project();
    project.set_tempo(MIN_TEMPO);
    project.set_delay_time(MAX_DELAY_TIME);

    assert.ok(
        project.delay_time_secs <= 8,
        `the longest delay is ${project.delay_time_secs}s, past the 8s line`
    );
});

test("every delay time is longer than the one before it", () =>
{
    // The control is a slider running along this table, so a setting further
    // along it that came out shorter would run the control backwards
    let project = new Project();
    let prev_secs = 0;

    for (let time = MIN_DELAY_TIME; time <= MAX_DELAY_TIME; ++time)
    {
        project.set_delay_time(time);
        let secs = project.delay_time_secs;

        assert.ok(secs > prev_secs, `delay time ${time} is not past the one before it`);
        prev_secs = secs;
    }
});

test("a project starts with the filter doing nothing", () =>
{
    // A filter is something a track is swept with rather than something every
    // project has an opinion about, so the centre is where one starts and is
    // what a link that says nothing about it opens at
    let project = new Project();

    assert.equal(project.filter, DEFAULT_FILTER);
    assert.equal(project.resonance, DEFAULT_RESONANCE);
    assert.equal(project.filter_type, null);
    assert.equal(project.filter_freq, null);
});

test("the filter is a low-pass one way off centre and a high-pass the other", () =>
{
    let project = new Project();

    project.set_filter(-1);
    assert.equal(project.filter_type, 'lowpass');

    project.set_filter(1);
    assert.equal(project.filter_type, 'highpass');
});

test("either end of the filter's travel has taken everything it can", () =>
{
    // Hard over one way is a low-pass sitting under the whole kit, hard over
    // the other is a high-pass sitting above it. Both directions sweep the
    // same band, so both ends land on the same pair of frequencies.
    let project = new Project();

    project.set_filter(MIN_FILTER);
    assert.ok(Math.abs(project.filter_freq - FILTER_MIN_FREQ) < 1e-9);

    project.set_filter(MAX_FILTER);
    assert.ok(Math.abs(project.filter_freq - FILTER_MAX_FREQ) < 1e-9);
});

test("the first setting either side of the centre is barely filtering at all", () =>
{
    // Leaving the centre has to be a small step rather than a jump, since the
    // control is swept through it. A low-pass opens at the top of the band and
    // a high-pass at the bottom, i.e. each starts where it takes nothing away.
    let project = new Project();

    project.set_filter(-1);
    assert.ok(Math.abs(project.filter_freq - FILTER_MAX_FREQ) < 1e-9);

    project.set_filter(1);
    assert.ok(Math.abs(project.filter_freq - FILTER_MIN_FREQ) < 1e-9);
});

test("the filter sweeps one way and then the other as the control crosses the centre", () =>
{
    // Both halves of the travel take more away the further they go from the
    // centre, which is what makes the control read as one sweep rather than as
    // two ranges that happen to share a slider
    let project = new Project();
    let prev = Infinity;

    for (let filter = MIN_FILTER; filter < 0; ++filter)
    {
        project.set_filter(filter);
        assert.ok(project.filter_freq > prev || prev == Infinity,
            `low-pass at ${filter} does not open on the one before it`);
        prev = project.filter_freq;
    }

    prev = 0;

    for (let filter = 1; filter <= MAX_FILTER; ++filter)
    {
        project.set_filter(filter);
        assert.ok(project.filter_freq > prev,
            `high-pass at ${filter} does not close past the one before it`);
        prev = project.filter_freq;
    }
});

test("every filter setting stays inside the band it sweeps", () =>
{
    // The frequencies come out of a link somebody else made, and a filter set
    // past the audible band is one whose control has travel that does nothing
    let project = new Project();

    for (let filter = MIN_FILTER; filter <= MAX_FILTER; ++filter)
    {
        project.set_filter(filter);

        if (project.filter_freq === null)
            continue;

        assert.ok(
            project.filter_freq >= FILTER_MIN_FREQ - 1e-9 &&
            project.filter_freq <= FILTER_MAX_FREQ + 1e-9,
            `filter at ${filter} is set to ${project.filter_freq}Hz`
        );
    }
});

test("the resonance runs from no peak at all up to the cap and no further", () =>
{
    // The top is a ceiling on the range rather than a clamp applied later, for
    // the reason the delay feedback's is: a resonant peak is a boost, and the
    // setting comes out of a link that somebody else made
    let project = new Project();

    // Far enough off the centre for the peak to be all the way up (see below)
    project.set_filter(-MAX_FILTER);

    project.set_resonance(MIN_RESONANCE);
    assert.ok(Math.abs(project.filter_peak - FILTER_MIN_PEAK) < 1e-9);

    project.set_resonance(MAX_RESONANCE);
    assert.ok(Math.abs(project.filter_peak - FILTER_MAX_PEAK) < 1e-9);

    for (let res = MIN_RESONANCE; res <= MAX_RESONANCE; ++res)
    {
        project.set_resonance(res);
        assert.ok(
            project.filter_peak >= FILTER_MIN_PEAK &&
            project.filter_peak <= FILTER_MAX_PEAK,
            `resonance ${res} peaks at ${project.filter_peak}`
        );
    }
});

test("every resonance setting peaks harder than the one before it", () =>
{
    let project = new Project();
    project.set_filter(-MAX_FILTER);
    let prev = 0;

    for (let res = MIN_RESONANCE; res <= MAX_RESONANCE; ++res)
    {
        project.set_resonance(res);
        assert.ok(project.filter_peak > prev, `resonance ${res} does not peak past ${res - 1}`);
        prev = project.filter_peak;
    }
});

test("the resonance fades out as the cutoff comes back to the centre", () =>
{
    // The filter is switched in and out at the centre and changes which kind
    // it is on the way through, and neither can be ramped. Both are silent
    // only while the filter either side is doing nothing audible, which a
    // resonant peak sitting on the corner is not: hard over one way it is at
    // 14 kHz where nobody can hear it, but the other way it is on the bass.
    let project = new Project();
    project.set_resonance(MAX_RESONANCE);

    // Right beside the centre it has to be flat, whichever side it is on
    for (let filter of [-1, 1])
    {
        project.set_filter(filter);
        assert.ok(
            project.filter_peak < FILTER_MIN_PEAK * 1.2,
            `the peak at ${filter} is ${project.filter_peak}, not near flat`
        );
    }

    // And all the way up again once the control is past the fade
    for (let filter of [-FILTER_RESO_FADE, FILTER_RESO_FADE])
    {
        project.set_filter(filter);
        assert.ok(Math.abs(project.filter_peak - FILTER_MAX_PEAK) < 1e-9);
    }
});

test("the resonance only ever climbs as the cutoff leaves the centre", () =>
{
    // A fade that wasn't monotonic would be a peak that grew and shrank while
    // the control was moved one way, which is the sort of thing the crossing
    // is being smoothed to avoid in the first place
    let project = new Project();
    project.set_resonance(MAX_RESONANCE);

    let prev = 0;

    for (let filter = 0; filter <= MAX_FILTER; ++filter)
    {
        project.set_filter(filter);
        assert.ok(project.filter_peak >= prev, `the peak dips at ${filter}`);
        prev = project.filter_peak;
    }
});

test("a filter with no resonance is flat wherever it is set", () =>
{
    // The fade scales a peak towards flat, so a control that was never asked
    // for a peak has to come out flat the whole way across rather than dipping
    // under it somewhere
    let project = new Project();
    project.set_resonance(MIN_RESONANCE);

    for (let filter = MIN_FILTER; filter <= MAX_FILTER; ++filter)
    {
        project.set_filter(filter);
        assert.ok(Math.abs(project.filter_peak - FILTER_MIN_PEAK) < 1e-9,
            `the peak at ${filter} is ${project.filter_peak}`);
    }
});

test("the two filter stages together make the peak the resonance asks for", () =>
{
    // A biquad passes its own corner at a gain of its Q, so a pair of them
    // passes it at the product. Cascading two stages at the same Q would
    // square the peak instead, which at the top of the range would be about
    // 36 dB going back into somebody else's track.
    let project = new Project();

    project.set_filter(-MAX_FILTER);

    for (let res = MIN_RESONANCE; res <= MAX_RESONANCE; ++res)
    {
        project.set_resonance(res);

        assert.ok(
            Math.abs(project.filter_pole_q * project.filter_q - project.filter_peak) < 1e-9,
            `the stages at resonance ${res} do not come to the peak asked for`
        );
    }
});

test("the filter is flat at the bottom of the resonance range", () =>
{
    // Both stages together have to be a fourth-order Butterworth down there:
    // no peak at all, which is what a filter does when nobody has asked it for
    // a sound of its own. That is what fixes the slope stage's Q.
    let project = new Project();
    project.set_resonance(MIN_RESONANCE);

    // The pole Qs of a fourth-order Butterworth, which pass the corner at the
    // -3 dB that defines one
    assert.ok(Math.abs(project.filter_pole_q - 0.5412) < 1e-4);
    assert.ok(Math.abs(project.filter_q - 1.3066) < 1e-3);
    assert.ok(Math.abs(project.filter_peak - Math.SQRT1_2) < 1e-9);
});

test("the delay feedback stays short of running away", () =>
{
    // A loop fed back at or past unity builds on itself without bound, and the
    // settings come out of a link somebody else made. The ceiling is on the
    // range rather than clamped later, so there is no setting to get wrong.
    let project = new Project();

    for (let fb = MIN_DELAY_FB; fb <= MAX_DELAY_FB; fb += DELAY_FB_STEP)
    {
        project.set_delay_feedback(fb);
        assert.ok(project.delay_feedback_gain < 1, `feedback ${fb}% is not below unity`);
    }
});

test("swing holds a step back by its share of a step pair", () =>
{
    let project = new Project();

    // An even split leaves every step where the grid puts it
    project.set_swing(MIN_SWING);
    assert.equal(project.swing_delay, 0);

    // The far end of the range gives the pair a 3:1 ratio, i.e. a first step
    // one and a half steps long, so the second one starts half a step late
    project.set_swing(MAX_SWING);
    assert.equal(project.swing_delay, 0.5);

    // Triplet swing splits the pair 2:1. The setting is a whole percent and
    // triplets aren't, so this lands near a third of a step rather than on it.
    project.set_swing(67);
    assert.ok(Math.abs(project.swing_delay - 1 / 3) < 0.01);
});

test("humanize scatters nothing at the bottom of its travel", () =>
{
    let project = new Project();

    // The default, and what every link written before there was a humanize
    // control opens as. Both spreads have to be exactly zero rather than
    // nearly so: the audio engine tests them to decide whether to draw at all.
    assert.equal(project.humanize, DEFAULT_HUMANIZE);
    assert.equal(project.humanize_time, 0);
    assert.equal(project.humanize_gain, 0);

    project.set_humanize(MIN_HUMANIZE);
    assert.equal(project.humanize_time, 0);
    assert.equal(project.humanize_gain, 0);
});

test("humanize reaches its full spread at the top of its travel", () =>
{
    let project = new Project();
    project.set_humanize(MAX_HUMANIZE);

    assert.equal(project.humanize_time, HUMANIZE_MAX_TIME);
    assert.equal(project.humanize_gain, HUMANIZE_MAX_GAIN);

    // And runs evenly between the ends, the control being linear in both
    project.set_humanize(MAX_HUMANIZE / 2);
    assert.ok(Math.abs(project.humanize_time - HUMANIZE_MAX_TIME / 2) < 1e-9);
    assert.ok(Math.abs(project.humanize_gain - HUMANIZE_MAX_GAIN / 2) < 1e-9);
});

test("how far a humanized hit may be pushed follows the tempo", () =>
{
    let project = new Project();

    // The spread is set in seconds and a step is not, so what keeps a hit on
    // the grid at the fast end of the range is a bound that shrinks with the
    // step (see HUMANIZE_MAX_STEPS)
    project.set_tempo(MIN_TEMPO);
    let slow = project.humanize_max_offs;

    project.set_tempo(MAX_TEMPO);
    let fast = project.humanize_max_offs;

    assert.ok(fast < slow, 'a faster song should hold its hits closer in');
    assert.ok(
        Math.abs(slow / fast - MAX_TEMPO / MIN_TEMPO) < 1e-9,
        'the bound should scale with the step and not with something else'
    );

    // At the top of the tempo range the bound is what actually binds: it comes
    // out under the widest draw the timing spread can produce, which is what
    // this is here to guarantee.
    project.set_humanize(MAX_HUMANIZE);
    assert.ok(
        project.humanize_max_offs < HUMANIZE_MAX_TIME * 2.5,
        'the fastest tempo should clamp the tail of the spread'
    );
});

test("a pattern can be added up to the pattern limit and no further", () =>
{
    let project = new Project();

    while (project.num_patterns < MAX_PATTERNS)
    {
        let pat_idx = project.new_pattern(0);
        assert.equal(pat_idx, project.num_patterns - 1);
    }

    assert.equal(project.new_pattern(0), null);
    assert.equal(project.copy_pattern(0), null);
    assert.equal(project.num_patterns, MAX_PATTERNS);
});

test("a new pattern takes the samples and length of the one it came from", () =>
{
    let project = new Project();
    project.patterns[0] = new Pattern([2, 3], 5);
    project.patterns[0].toggle_cell(0, 0);

    let pat_idx = project.new_pattern(0);
    let pat = project.patterns[pat_idx];

    assert.deepEqual(pat.sample_idxs, [2, 3]);
    assert.equal(pat.num_steps, 5);
    assert.ok(pat.is_inactive());
});

test("a copied pattern takes the cells too", () =>
{
    let project = new Project();
    project.patterns[0].toggle_cell(0, 0);

    let pat_idx = project.copy_pattern(0);

    assert.ok(!project.patterns[pat_idx].is_inactive());
    assert.equal(project.patterns[pat_idx].get_cell(0, 0), 1);
});

test("a newly created pattern is placed nowhere on the timeline", () =>
{
    let project = new Project();
    project.toggle_lane_cell(0, 0);

    let pat_idx = project.copy_pattern(0);

    assert.deepEqual(project.lanes[pat_idx], []);
});

test("the last pattern of a project cannot be deleted", () =>
{
    let project = new Project();

    assert.equal(project.delete_pattern(0), false);
    assert.equal(project.num_patterns, 1);
});

test("deleting a pattern takes its timeline lane with it", () =>
{
    let project = new Project();
    project.new_pattern(0);
    project.new_pattern(0);

    project.toggle_lane_cell(0, 0);
    project.toggle_lane_cell(2, 1);

    assert.equal(project.delete_pattern(1), true);

    // Pattern 2 and its lane both shifted down into index 1
    assert.equal(project.num_patterns, 2);
    assert.equal(project.lanes.length, 2);
    assert.deepEqual(project.lanes[0], [1]);
    assert.deepEqual(project.lanes[1], [0, 1]);
});

//============================================================================
// Timeline
//============================================================================

test("turning on a cell past the end of a lane extends the lane to it", () =>
{
    let project = new Project();

    assert.equal(project.toggle_lane_cell(0, 3), true);
    assert.deepEqual(project.lanes[0], [0, 0, 0, 1]);
    assert.equal(project.get_lane_cell(0, 3), 1);
});

test("a cell past the end of a lane reads as empty", () =>
{
    let project = new Project();

    assert.equal(project.get_lane_cell(0, 99), 0);
    assert.equal(project.pat_active_at(0, 99 * DEFAULT_PAT_STEPS), 0);
});

test("turning off the last cell of a lane trims the silence it leaves", () =>
{
    let project = new Project();
    project.toggle_lane_cell(0, 0);
    project.toggle_lane_cell(0, 4);

    assert.deepEqual(project.lanes[0], [1, 0, 0, 0, 1]);

    // The lane must not end on an inactive cell, so the gap goes with it
    assert.equal(project.toggle_lane_cell(0, 4), false);
    assert.deepEqual(project.lanes[0], [1]);
});

test("a pattern cannot be placed past the end of the song", () =>
{
    let project = new Project();
    let pat = project.patterns[0];

    // One cell is one playthrough, so this is the last cell that fits
    let last_cell = MAX_SONG_STEPS / pat.num_steps - 1;

    assert.equal(project.toggle_lane_cell(0, last_cell), true);
    assert.equal(project.toggle_lane_cell(0, last_cell + 1), false);
    assert.equal(project.lanes[0].length, last_cell + 1);
});

test("a pattern plays over every step of the cell it is placed at", () =>
{
    let project = new Project();
    project.patterns[0] = new Pattern([0], 4);
    project.toggle_lane_cell(0, 1);

    assert.equal(project.pat_active_at(0, 3), 0);
    assert.equal(project.pat_active_at(0, 4), 1);
    assert.equal(project.pat_active_at(0, 7), 1);
    assert.equal(project.pat_active_at(0, 8), 0);
});

test("the song ends where the last pattern stops, rounded up to a bar", () =>
{
    let project = new Project();
    project.patterns[0] = new Pattern([0], 5);

    // Three playthroughs of a 5-step pattern is 15 steps, which is part of a bar
    project.toggle_lane_cell(0, 2);

    assert.equal(project.lanes[0].length, 3);
    assert.equal(project.song_num_steps, STEPS_PER_BAR);
});

test("the song is as long as the pattern that runs furthest", () =>
{
    let project = new Project();
    project.patterns[0] = new Pattern([0], STEPS_PER_BAR);
    project.new_pattern(0);
    project.patterns[1] = new Pattern([0], STEPS_PER_BAR);

    project.toggle_lane_cell(0, 0);
    project.toggle_lane_cell(1, 2);

    assert.equal(project.song_num_steps, 3 * STEPS_PER_BAR);
});

test("the song stops at the length limit", () =>
{
    let project = new Project();
    let pat = project.patterns[0];

    project.toggle_lane_cell(0, MAX_SONG_STEPS / pat.num_steps - 1);

    assert.equal(project.song_num_steps, MAX_SONG_STEPS);
});

//============================================================================
// Preconditions
//
// These are stated with console.assert, which only prints in the browser. The
// test setup records them instead, and drain_asserts() is how a test says it
// expected one to fire. See tests/setup.js.
//============================================================================

test("a tempo outside the allowed range is refused", () =>
{
    let project = new Project();

    project.set_tempo(MIN_TEMPO - 1);
    assert.equal(drain_asserts().length, 1);

    project.set_tempo(MAX_TEMPO + 1);
    assert.equal(drain_asserts().length, 1);
});

test("a swing outside the allowed range is refused", () =>
{
    let project = new Project();

    project.set_swing(MIN_SWING - 1);
    assert.equal(drain_asserts().length, 1);

    project.set_swing(MAX_SWING + 1);
    assert.equal(drain_asserts().length, 1);
});

test("a humanize outside the allowed range is refused", () =>
{
    let project = new Project();

    project.set_humanize(MIN_HUMANIZE - 1);
    assert.equal(drain_asserts().length, 1);

    project.set_humanize(MAX_HUMANIZE + 1);
    assert.equal(drain_asserts().length, 1);
});

test("a pattern outside the allowed size is refused", () =>
{
    new Pattern([0], MAX_PAT_STEPS + 1);
    assert.equal(drain_asserts().length, 1);

    new Pattern([0], MIN_PAT_STEPS - 1);
    assert.equal(drain_asserts().length, 1);

    new Pattern(Array(MAX_PAT_ROWS + 1).fill(0), MIN_PAT_STEPS);
    assert.equal(drain_asserts().length, 1);
});

test("a stereo position outside the allowed range is refused", () =>
{
    let pat = new Pattern([0], MIN_PAT_STEPS);

    pat.set_row_pan(0, MIN_PAN - 1);
    assert.equal(drain_asserts().length, 1);

    pat.set_row_pan(0, MAX_PAN + 1);
    assert.equal(drain_asserts().length, 1);
});

test("a level outside the allowed range is refused", () =>
{
    let pat = new Pattern([0], MIN_PAT_STEPS);

    pat.set_row_volume(0, MIN_VOLUME - 1);
    assert.equal(drain_asserts().length, 1);

    pat.set_row_volume(0, MAX_VOLUME + 1);
    assert.equal(drain_asserts().length, 1);
});

test("a delay send outside the allowed range is refused", () =>
{
    let pat = new Pattern([0], MIN_PAT_STEPS);

    pat.set_row_send(0, MIN_SEND - 1);
    assert.equal(drain_asserts().length, 1);

    pat.set_row_send(0, MAX_SEND + 1);
    assert.equal(drain_asserts().length, 1);
});

test("a delay setting outside the allowed range is refused", () =>
{
    let project = new Project();

    project.set_delay_time(MIN_DELAY_TIME - 1);
    assert.equal(drain_asserts().length, 1);

    project.set_delay_time(MAX_DELAY_TIME + 1);
    assert.equal(drain_asserts().length, 1);

    project.set_delay_feedback(MIN_DELAY_FB - DELAY_FB_STEP);
    assert.equal(drain_asserts().length, 1);

    project.set_delay_feedback(MAX_DELAY_FB + DELAY_FB_STEP);
    assert.equal(drain_asserts().length, 1);
});

test("a delay feedback between two settings is refused", () =>
{
    // Only the settings the control stops at have room in a link, so a value
    // between two of them would fail the encoding rather than be caught here
    let project = new Project();

    project.set_delay_feedback(MIN_DELAY_FB + 1);
    assert.equal(drain_asserts().length, 1);
});

test("mixing a row the pattern does not have is refused", () =>
{
    let pat = new Pattern([0], MIN_PAT_STEPS);

    pat.set_row_pan(pat.num_rows, DEFAULT_PAN);
    assert.equal(drain_asserts().length, 1);

    pat.set_row_volume(pat.num_rows, DEFAULT_VOLUME);
    assert.equal(drain_asserts().length, 1);

    // How many rows a pattern has is how many samples it plays, so neither of
    // those gave it a row by writing past the end of it
    assert.equal(pat.num_rows, 1);
});

test("a pattern index past the end of the project is refused", () =>
{
    let project = new Project();

    assert.equal(project.delete_pattern(5), false);
    assert.equal(drain_asserts().length, 1);
    assert.equal(project.num_patterns, 1);
});

test("reading a lane past the end of the project fails outright", () =>
{
    // The precondition is stated the same way, but there is nothing to fall
    // back on here: an index past the end has no lane to read a cell out of.
    // Nothing in the app reaches this, and this is what it would do if it did.
    let project = new Project();

    assert.throws(() => project.get_lane_cell(1, 0), TypeError);
    assert.equal(drain_asserts().length, 1);
});
