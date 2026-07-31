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
    MIN_PAN,
    MAX_PAN,
    DEFAULT_PAN,
    MIN_VOLUME,
    MAX_VOLUME,
    DEFAULT_VOLUME,
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

    pat.set_row_pan(2, MAX_PAN);

    pat.toggle_cell(3, 2);
    pat.set_row_volume(3, MIN_VOLUME);

    let stripped = pat.strip_inactive();

    assert.deepEqual(stripped.sample_idxs, [11, 13]);
    assert.deepEqual(stripped.pans, [6, DEFAULT_PAN]);
    assert.deepEqual(stripped.volumes, [-12, MIN_VOLUME]);
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
