// Tests for the URL encoding in model.js.
//
// A link is permanent once it's been shared, so this file leans on two things
// the rest of the tests don't need. There are golden strings, which are what
// catch a change to the format that still round-trips cleanly against itself.
// And the field widths are spelled out again here rather than imported: they
// describe the wire format, so a change to one of them in model.js is meant to
// fail these tests, not to be picked up by them.

import { test } from "node:test";
import assert from "node:assert/strict";

import { drain_asserts } from "./setup.js";

import {
    CORPUS,
    build_song,
    get_song,
    lane_cells,
} from "./corpus.js";

import { GOLDEN_LINKS } from "./golden_links.js";

import {
    Pattern,
    Project,
    MIN_TEMPO,
    MAX_TEMPO,
    MIN_SWING,
    MAX_SWING,
    MIN_PAN,
    MAX_PAN,
    MIN_VOLUME,
    MAX_VOLUME,
    MIN_SEND,
    MAX_SEND,
    DEFAULT_SEND,
    MIN_DELAY_TIME,
    MAX_DELAY_TIME,
    MIN_DELAY_FB,
    MAX_DELAY_FB,
    DELAY_FB_STEP,
    MIN_PAT_STEPS,
    MAX_PAT_STEPS,
    MAX_PAT_ROWS,
    MAX_PATTERNS,
    MAX_SONG_STEPS,
    STEPS_PER_BAR,
    MIN_TITLE_CHARS,
    MAX_TITLE_CHARS,
    clean_title,
    encode_title,
    decode_title,
    title_error,
    encode_project,
    decode_project,
    project_to_hash,
    project_from_hash,
} from "../model.js";

//============================================================================
// Helpers
//============================================================================

// Compare everything about a project that the encoding is supposed to carry.
// The title travels beside the data rather than in it, so it isn't part of
// this; project_to_hash is what carries it.
//
// The label says which project failed, for the tests that run over a list of
// them rather than over one built in the test itself.
function assert_same_project(actual, expected, label = '')
{
    let of = label? ` of ${label}` : '';

    assert.equal(actual.tempo, expected.tempo, `tempo${of}`);
    assert.equal(actual.swing, expected.swing, `swing${of}`);
    assert.equal(actual.num_patterns, expected.num_patterns, `pattern count${of}`);

    for (let pat_idx = 0; pat_idx < expected.num_patterns; ++pat_idx)
    {
        let act = actual.patterns[pat_idx];
        let exp = expected.patterns[pat_idx];

        assert.equal(act.num_steps, exp.num_steps, `pattern ${pat_idx} length${of}`);
        assert.deepEqual(act.sample_idxs, exp.sample_idxs, `pattern ${pat_idx} samples${of}`);
        assert.deepEqual(act.rows, exp.rows, `pattern ${pat_idx} cells${of}`);
        assert.deepEqual(act.pans, exp.pans, `pattern ${pat_idx} panning${of}`);
        assert.deepEqual(act.volumes, exp.volumes, `pattern ${pat_idx} levels${of}`);
        assert.deepEqual(act.sends, exp.sends, `pattern ${pat_idx} sends${of}`);
    }

    assert.equal(actual.delay_time, expected.delay_time, `delay time${of}`);
    assert.equal(actual.delay_feedback, expected.delay_feedback, `delay feedback${of}`);

    assert.deepEqual(actual.lanes, expected.lanes, `timeline lanes${of}`);
}

// Encode a project and read it straight back
function round_trip(project)
{
    return decode_project(encode_project(project));
}

// What a project is once the encoding has had its way with it, i.e. with
// everything that plays nothing left out (see model.js). A song written out by
// hand has every row in use and so is unchanged by this, but one built in the
// editor tends to carry rows nobody ever filled in, and those don't come back.
function as_encoded(project)
{
    let out = new Project();
    out.set_tempo(project.tempo);
    out.set_swing(project.swing);
    out.set_delay_time(project.delay_time);
    out.set_delay_feedback(project.delay_feedback);
    out.patterns = [];
    out.lanes = [];

    for (let pat_idx = 0; pat_idx < project.num_patterns; ++pat_idx)
    {
        if (project.patterns[pat_idx].is_inactive())
            continue;

        out.patterns.push(project.patterns[pat_idx].strip_inactive());
        out.lanes.push(project.lanes[pat_idx]);
    }

    // A project always has at least one pattern, so one where nothing plays
    // keeps its first pattern rather than becoming patternless
    if (out.patterns.length == 0)
    {
        out.patterns.push(project.patterns[0].strip_inactive());
        out.lanes.push(project.lanes[0]);
    }

    return out;
}

// Build a project out of patterns given as their samples, cells and lane, so
// that a test can say what it's encoding in one place
function make_project(tempo, pats)
{
    let project = new Project();
    project.set_tempo(tempo);
    project.patterns = [];
    project.lanes = [];

    for (let { sample_idxs, rows, lane = [] } of pats)
    {
        let pat = new Pattern(sample_idxs, rows[0].length);
        pat.rows = rows;
        project.patterns.push(pat);
        project.lanes.push(typeof lane == 'string'? lane_cells(lane) : lane);
    }

    return project;
}

// Pack a string of '0' and '1' into the base64url form a link carries, so that
// a test can hand the decoder bytes that no encoder would produce
function bits_to_b64(bits)
{
    let bytes = [];

    for (let i = 0; i < bits.length; i += 8)
        bytes.push(parseInt(bits.slice(i, i + 8).padEnd(8, '0'), 2));

    return btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
}

// Field widths of the encoding, mirrored from model.js on purpose (see above)
const ENCODING_VERSION = 0;
const VERSION_BITS = 4;
const TEMPO_BITS = 8;
const SWING_BITS = 5;
const NUM_PATTERNS_BITS = 6;
const NUM_STEPS_BITS = 6;
const NUM_ROWS_BITS = 4;
const SAMPLE_IDX_BITS = 9;
const PAN_BITS = 5;
const VOLUME_BITS = 5;
const SEND_BITS = 5;
const MOTIF_PERIOD_BITS = 2;
const MOTIF_EXC_PERIOD_BITS = 4;
const MOTIF_EXC_COUNT_BITS = 3;
const SPARSE_COUNT_BITS = 4;

// The tag naming the scheme a row's cells were written in, as the bits it is
// made of. These are of different lengths, so a test writes the tag itself
// rather than a value in a field of a fixed width.
const GRID_MOTIF = '00';
const GRID_SPARSE = '01';
const GRID_GROUP_8 = '100';
const GRID_MOTIF_EXC = '101';
const GRID_COPY_PREV = '110';
const GRID_LITERAL = '1110';
const GRID_GROUP_4 = '11110';
const GRID_GROUP_16 = '11111';
const VAR_CHUNK_BITS = 3;

// Write a value into a fixed-width field, most significant bit first
function field(val, num_bits)
{
    return val.toString(2).padStart(num_bits, '0');
}

// The header of a link holding one pattern of one row, one step and no cell,
// which is the smallest thing the decoder will accept. Tests that are about
// what follows it start from this.
const ONE_EMPTY_PATTERN =
    field(ENCODING_VERSION, VERSION_BITS) +            // encoding version
    field(80, TEMPO_BITS) +             // tempo, offset from MIN_TEMPO
    field(0, SWING_BITS) +              // swing, offset from MIN_SWING
    '1' +                               // the delay is set the way it starts
    field(0, NUM_PATTERNS_BITS) +       // one pattern
    field(0, NUM_STEPS_BITS) +          // one step
    field(0, NUM_ROWS_BITS) +           // one row
    '0' +                               // the sample isn't the predicted one
    field(0, SAMPLE_IDX_BITS) +         // sample index 0
    GRID_LITERAL +                      // the cells are written out flat
    '0' +                               // the row's one cell, off
    '1' +                               // the row is panned where it's expected
    '1' +                               // and is at the level expected too
    '1';                                // and sends the delay what's expected

//============================================================================
// Round trips
//============================================================================

test("a new project survives a round trip", () =>
{
    let project = new Project();
    let decoded = round_trip(project);

    // Nothing plays, so the pattern comes back stripped to its first row
    assert.equal(decoded.num_patterns, 1);
    assert.equal(decoded.patterns[0].num_rows, 1);
    assert.equal(decoded.tempo, project.tempo);
    assert.deepEqual(decoded.lanes, [[]]);
});

test("a project with several patterns survives a round trip", () =>
{
    let project = make_project(96, [
        { sample_idxs: [0, 5], rows: [[1, 0, 1, 0], [0, 0, 0, 1]], lane: [1, 1] },
        { sample_idxs: [12], rows: [[1, 1, 0]], lane: [0, 0, 1] },
        { sample_idxs: [3, 4, 7], rows: [[1], [1], [1]], lane: [] },
    ]);

    assert_same_project(round_trip(project), project);
});

test("both ends of the tempo range survive a round trip", () =>
{
    for (let tempo of [MIN_TEMPO, MAX_TEMPO, 120])
    {
        let project = make_project(tempo, [
            { sample_idxs: [0], rows: [[1]] },
        ]);

        assert.equal(round_trip(project).tempo, tempo);
    }
});

test("both ends of the swing range survive a round trip", () =>
{
    for (let swing of [MIN_SWING, MAX_SWING, 67])
    {
        let project = make_project(120, [
            { sample_idxs: [0], rows: [[1]] },
        ]);
        project.set_swing(swing);

        assert.equal(round_trip(project).swing, swing);
    }
});

test("both ends of the pattern length range survive a round trip", () =>
{
    for (let num_steps of [MIN_PAT_STEPS, MAX_PAT_STEPS])
    {
        let project = make_project(120, [
            { sample_idxs: [0], rows: [Array(num_steps).fill(1)] },
        ]);

        assert_same_project(round_trip(project), project);
    }
});

test("a pattern with every row in use survives a round trip", () =>
{
    let project = make_project(120, [{
        sample_idxs: Array.from({ length: MAX_PAT_ROWS }, (_, i) => i),
        rows: Array.from({ length: MAX_PAT_ROWS }, () => [1]),
    }]);

    assert_same_project(round_trip(project), project);
});

test("a project holding as many patterns as it can survives a round trip", () =>
{
    let pats = Array.from({ length: MAX_PATTERNS }, (_, i) => ({
        sample_idxs: [i],
        rows: [[1]],
    }));

    let project = make_project(120, pats);

    assert_same_project(round_trip(project), project);
});

test("both ends of the sample index range survive a round trip", () =>
{
    // A sample index is 9 bits wide, and the top of that range is reachable
    // long before there are that many samples: an index is reserved forever,
    // so the numbering keeps climbing as samples come and go
    let project = make_project(120, [
        { sample_idxs: [0, 2 ** SAMPLE_IDX_BITS - 1], rows: [[1], [1]] },
    ]);

    assert_same_project(round_trip(project), project);
});

test("timeline lanes of every shape survive a round trip", () =>
{
    let lanes = [
        [],                       // placed nowhere
        [1],                      // one cell, at the start
        [0, 1],                   // one cell, after a gap
        [1, 1, 1, 1],             // one long block
        [1, 0, 1],                // two blocks, one cell each
        [0, 0, 1, 1, 0, 0, 0, 1], // gaps and blocks of different sizes
    ];

    for (let lane of lanes)
    {
        let project = make_project(120, [
            { sample_idxs: [0], rows: [[1, 0, 1, 0]], lane: lane },
        ]);

        assert.deepEqual(round_trip(project).lanes[0], lane, JSON.stringify(lane));
    }
});

test("the amen break fills a pattern to its limit", () =>
{
    let project = get_song('the amen break');

    // About as much as a single pattern can hold
    assert.equal(project.patterns[0].num_steps, MAX_PAT_STEPS);

    // Every row plays something, so none of them is dropped on the way through
    assert.equal(round_trip(project).patterns[0].num_rows, 4);
});

test("a drum and bass roller keeps every row it plays", () =>
{
    // No row of it is quiet enough to be dropped on the way through
    let project = get_song('a drum and bass roller');
    assert.equal(round_trip(project).patterns[0].num_rows, 6);
});

//============================================================================
// Whole songs
//
// The tests above encode one pattern at a time. The corpus in tests/corpus.js
// holds whole ones: arrangements of several patterns laid out across 32 bars
// of timeline, each with a lane of its own, and in each case a layer whose
// pattern length doesn't divide the bar, so it phases against everything else
// rather than lining up with it.
//
// The first tests below run the encoding over every song there is. The ones
// after them are each about what is particular to one song, and take it from
// the corpus by name.
//============================================================================

test("every song in the corpus survives a round trip", () =>
{
    // A song with a row nobody filled in comes back without it, so what a
    // round trip has to preserve is the song minus what plays nothing
    for (let song of CORPUS)
    {
        let project = build_song(song);
        assert_same_project(round_trip(project), as_encoded(project), song.name);
    }
});

test("every song in the corpus re-encodes to the link it came from", () =>
{
    // Encoding drops what plays nothing, so a project that has been through it
    // once comes back already stripped, and has to survive a second pass
    // unchanged. An encoding that failed this would give one song two different
    // links depending on how many times it had been shared.
    for (let song of CORPUS)
    {
        let hash = project_to_hash(build_song(song));
        assert.equal(project_to_hash(project_from_hash(hash)), hash, song.name);
    }
});

test("every song in the corpus runs for the length it says", () =>
{
    // Songs are all sorts of lengths, and each one states its own: what this
    // catches is a lane that no longer reaches where its song is meant to end
    for (let song of CORPUS)
    {
        let steps = build_song(song).song_num_steps;
        assert.equal(steps, song.song_bars * STEPS_PER_BAR, song.name);
    }
});

test("the two bar patterns of an arrangement tile the song", () =>
{
    // Every bar has exactly one of them playing, with the layer whose length
    // doesn't divide the bar running across on top
    for (let name of ['a 32 bar hip hop arrangement', 'a 32 bar techno arrangement'])
    {
        let project = get_song(name);
        let num_bars = project.song_num_steps / STEPS_PER_BAR;

        for (let bar = 0; bar < num_bars; ++bar)
        {
            let playing = [0, 1, 2, 3].filter(
                pat_idx => project.pat_active_at(pat_idx, bar * STEPS_PER_BAR)
            );

            assert.equal(playing.length, 1, `${name}, bar ${bar + 1}`);
        }
    }
});

test("a house arrangement layers its patterns instead of tiling them", () =>
{
    // The two arrangements above hand the song from one pattern to the next,
    // so only one of them plays at a time. This one stacks them, which is what
    // makes it worth having here: the timeline has to carry several lanes
    // active across the same bars rather than one at a time.
    let project = get_song('a 64 bar house arrangement');
    let num_bars = project.song_num_steps / STEPS_PER_BAR;
    let per_bar = [];

    for (let bar = 0; bar < num_bars; ++bar)
    {
        let playing = 0;

        for (let pat_idx = 0; pat_idx < project.num_patterns; ++pat_idx)
            playing += project.pat_active_at(pat_idx, bar * STEPS_PER_BAR)? 1:0;

        per_bar.push(playing);
    }

    // Something plays in every bar, and the fullest of them have six patterns
    // sounding at once, which no other song here comes near
    assert.ok(Math.min(...per_bar) >= 1, 'a bar with nothing playing in it');
    assert.equal(Math.max(...per_bar), 6);

    // And its patterns are of three different lengths, so the lanes hold cells
    // of one, two and four bars alongside each other
    let lens = [...new Set(project.patterns.map(pat => pat.num_steps))];
    assert.deepEqual(lens.sort((a, b) => a - b), [16, 32, 64]);
});

test("an arrangement has a layer that never lands on a bar line", () =>
{
    // The phasing layer starts on a bar line and then never lands on one again
    // for the rest of the song, which is what a seven-step pattern does
    let blip = get_song('a 32 bar techno arrangement').patterns[4];

    assert.equal(blip.num_steps, 7);
    assert.notEqual(STEPS_PER_BAR % blip.num_steps, 0);
});

test("patterns of prime lengths phase against each other", () =>
{
    let lens = get_song('patterns of prime lengths').patterns.map(pat => pat.num_steps);

    assert.deepEqual(lens, [16, 5, 7, 11, 13]);

    // No two of them share a factor, so no two ever line up until both have
    // run a whole number of times
    const gcd = (a, b) => b? gcd(b, a % b) : a;

    for (let i = 0; i < lens.length; ++i)
    {
        for (let j = i + 1; j < lens.length; ++j)
            assert.equal(gcd(lens[i], lens[j]), 1, `${lens[i]} and ${lens[j]} share a factor`);
    }

    // Which puts the point where the whole thing comes back around at the
    // product of the lot, well past the longest song the format can hold. The
    // arrangement never repeats itself, however far the timeline is extended.
    let cycle = lens.reduce((a, b) => a / gcd(a, b) * b);

    assert.equal(cycle, 16 * 5 * 7 * 11 * 13);
    assert.ok(cycle > MAX_SONG_STEPS, `${cycle} steps would fit in a song`);
});

test("a lane reaching the end of the song survives a round trip", () =>
{
    let num_steps = MAX_PAT_STEPS;
    let lane = Array(MAX_SONG_STEPS / num_steps).fill(1);

    let project = make_project(120, [
        { sample_idxs: [0], rows: [Array(num_steps).fill(1)], lane: lane },
    ]);

    assert.deepEqual(round_trip(project).lanes[0], lane);
});

//============================================================================
// What the encoding drops
//
// Encoding is lossy: anything that plays nothing is left out, which is what
// keeps a link short. These pin down exactly what comes back.
//============================================================================

test("rows that play nothing are dropped", () =>
{
    let project = make_project(120, [
        { sample_idxs: [1, 2, 3], rows: [[0, 0], [1, 0], [0, 0]] },
    ]);

    let decoded = round_trip(project);

    assert.equal(decoded.patterns[0].num_rows, 1);
    assert.deepEqual(decoded.patterns[0].sample_idxs, [2]);
    assert.deepEqual(decoded.patterns[0].rows, [[1, 0]]);
});

test("patterns that play nothing are dropped, along with their lanes", () =>
{
    let project = make_project(120, [
        { sample_idxs: [1], rows: [[0, 0]], lane: [1] },
        { sample_idxs: [2], rows: [[1, 0]], lane: [0, 1] },
        { sample_idxs: [3], rows: [[0, 0]], lane: [1] },
    ]);

    let decoded = round_trip(project);

    assert.equal(decoded.num_patterns, 1);
    assert.deepEqual(decoded.patterns[0].sample_idxs, [2]);

    // The surviving pattern keeps the lane that was its own
    assert.deepEqual(decoded.lanes, [[0, 1]]);
});

test("a project where nothing plays keeps one pattern of one row", () =>
{
    let project = make_project(120, [
        { sample_idxs: [8, 9], rows: [[0, 0], [0, 0]] },
    ]);

    let decoded = round_trip(project);

    assert.equal(decoded.num_patterns, 1);
    assert.equal(decoded.patterns[0].num_rows, 1);
    assert.deepEqual(decoded.patterns[0].sample_idxs, [8]);
    assert.deepEqual(decoded.lanes, [[]]);
});

test("a pattern keeps its length even when its cells are dropped", () =>
{
    let project = make_project(120, [
        { sample_idxs: [0], rows: [Array(MAX_PAT_STEPS).fill(0)] },
    ]);

    assert.equal(round_trip(project).patterns[0].num_steps, MAX_PAT_STEPS);
});

//============================================================================
// Row cells
//
// A row's cells go into a link in whichever of four schemes writes them in the
// fewest bits, and which one that was is written in front of them. The schemes
// work in cells and groups that a row's length need not be a whole number of,
// so what these are mostly about is rows whose length doesn't line up with the
// scheme that got picked.
//============================================================================

// Cells of a row written as a string, so that a case below reads as the grid
// it stands for rather than as a list of numbers
function row_cells(str)
{
    return Array.from(str, ch => ch == 'x'? 1:0);
}

// A row on its own, round-tripped through a link
function round_trip_row(cells)
{
    let project = make_project(120, [{ sample_idxs: [0], rows: [cells] }]);

    return round_trip(project).patterns[0].rows[0];
}

test("a row repeating a short cell survives a round trip", () =>
{
    // Every cell length the format holds, laid down over a row that is a whole
    // number of them long and over one that cuts the last repeat short
    for (let period of [2, 4, 8, 16])
    {
        let cell = Array.from({ length: period }, (_, i) => i == 0? 1:0);

        for (let num_steps of [period + 1, 3 * period, 4 * period - 1, 64])
        {
            let cells = Array.from({ length: num_steps }, (_, i) => cell[i % period]);
            assert.deepEqual(round_trip_row(cells), cells, `cell of ${period} over ${num_steps}`);
        }
    }
});

test("a row repeating in groups survives a round trip", () =>
{
    // Three identical half bars and a fourth that fills, which is the shape
    // the group schemes are there for and the one no repeated cell can hold
    let cells = row_cells(
        'x...x...' + 'x...x...' + 'x...x...' + 'x...x.xx');

    assert.deepEqual(round_trip_row(cells), cells);
});

test("a row that repeats past where it ends survives a round trip", () =>
{
    // A row whose last group is cut short, so that the group standing in for
    // it is only the same as it as far as the row goes
    let cells = row_cells('x.x.x.x.' + 'x.x.x.x.' + 'x.x.');

    assert.deepEqual(round_trip_row(cells), cells);
});

test("rows of every length survive a round trip whatever they hold", () =>
{
    // A row is written in cells of up to 16 steps and groups of up to 16, and
    // a length that is not a whole number of either is what would catch a
    // scheme writing one step too many or one too few. Every length the format
    // holds is tried, against rows shaped to reach each of the schemes and one
    // shaped to reach none of them.
    let seed = 1;
    let next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) % 2;

    for (let num_steps = MIN_PAT_STEPS; num_steps <= MAX_PAT_STEPS; ++num_steps)
    {
        let cases = [
            Array(num_steps).fill(0),
            Array(num_steps).fill(1),
            Array.from({ length: num_steps }, (_, i) => i % 2),
            Array.from({ length: num_steps }, (_, i) => i % 4 == 0? 1:0),
            Array.from({ length: num_steps }, (_, i) => i % 16 == 0? 1:0),
            Array.from({ length: num_steps }, (_, i) => i < num_steps / 2? 1:0),
            Array.from({ length: num_steps }, () => next()),
        ];

        for (let cells of cases)
            assert.deepEqual(round_trip_row(cells), cells, `${num_steps} steps: ${cells.join('')}`);
    }
});

test("a row that repeats goes into a shorter link than one that doesn't", () =>
{
    let repeating = make_project(120, [
        { sample_idxs: [0], rows: [row_cells('x...'.repeat(8))] },
    ]);

    // The same number of cells over the same length, placed so that the row
    // holds no repeat of any length the schemes work in
    let scattered = make_project(120, [
        { sample_idxs: [0], rows: [row_cells('x..x..x...x....x.....x......x...')] },
    ]);

    assert.ok(
        encode_project(repeating).length < encode_project(scattered).length,
        'a repeating row should cost less than a scattered one'
    );
});

test("a link repeating a cell as long as its row is refused", () =>
{
    // The encoder writes a row like this out flat instead, a cell that long
    // being no shorter, so a link claiming one has been edited by hand
    let bits =
        field(ENCODING_VERSION, VERSION_BITS) +
        field(80, TEMPO_BITS) +
        field(0, SWING_BITS) +
        '1' +                               // the delay is set the way it starts
        field(0, NUM_PATTERNS_BITS) +
        field(1, NUM_STEPS_BITS) +          // two steps
        field(0, NUM_ROWS_BITS) +           // one row
        '0' + field(0, SAMPLE_IDX_BITS) +   // sample index 0
        GRID_MOTIF +                        // the cells repeat a short cell
        field(0, MOTIF_PERIOD_BITS) +       // ...of two steps, as long as the row
        '10';

    assert.throws(
        () => decode_project(bits_to_b64(bits)),
        /repeats a cell as long as itself/
    );
});

// The header of a link holding one pattern of one row and four steps, up to
// the point where the row's cells begin. The tests below carry on from here
// with cells written in one scheme or another.
const FOUR_STEP_ROW =
    field(ENCODING_VERSION, VERSION_BITS) +
    field(80, TEMPO_BITS) +
    field(0, SWING_BITS) +
    '1' +                               // the delay is set the way it starts
    field(0, NUM_PATTERNS_BITS) +
    field(3, NUM_STEPS_BITS) +          // four steps
    field(0, NUM_ROWS_BITS) +           // one row
    '0' + field(0, SAMPLE_IDX_BITS);    // sample index 0

test("a sparse row survives a round trip", () =>
{
    // A row with a handful of steps in a long pattern is written as the steps
    // that play rather than as one bit per step, so this is the shape the
    // scheme exists for
    let row = Array(64).fill(0);
    row[0] = row[17] = row[63] = 1;

    let project = make_project(120, [{ sample_idxs: [0], rows: [row] }]);
    let decoded = round_trip(project);

    assert.deepEqual(decoded.patterns[0].rows[0], row);
});

test("a motif row with a few steps written out survives a round trip", () =>
{
    // A bar that repeats except for a fill at the end of the phrase, which is
    // what the scheme is for
    let row = [];
    for (let bar = 0; bar < 4; ++bar)
        row.push(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0);

    row[61] = 1;
    row[63] = 1;

    let project = make_project(120, [{ sample_idxs: [0], rows: [row] }]);
    let decoded = round_trip(project);

    assert.deepEqual(decoded.patterns[0].rows[0], row);
});

test("a row copied from the pattern before it survives a round trip", () =>
{
    let row = [1, 0, 1, 1, 0, 0, 1, 0];

    let project = make_project(120, [
        { sample_idxs: [0], rows: [row.slice()] },
        { sample_idxs: [0], rows: [row.slice()] },
    ]);

    let decoded = round_trip(project);

    assert.deepEqual(decoded.patterns[0].rows[0], row);
    assert.deepEqual(decoded.patterns[1].rows[0], row);

    // The copy has to be a copy: editing one pattern must not reach into the
    // other, which sharing the array between them would let it do
    decoded.patterns[1].rows[0][0] = 0;

    assert.equal(decoded.patterns[0].rows[0][0], 1);
});

test("a link copying a row that is not there is refused", () =>
{
    // Nothing precedes the first pattern of a link, so its rows have nothing
    // to copy and the encoder never names this scheme for them
    let bits = FOUR_STEP_ROW + GRID_COPY_PREV;

    assert.throws(
        () => decode_project(bits_to_b64(bits)),
        /copies a row that is not there/
    );
});

test("a link naming a cell length that does not exist is refused", () =>
{
    // The period field is wider than the list of lengths it picks from, so
    // most of what it can hold names nothing
    let bits =
        FOUR_STEP_ROW +
        GRID_MOTIF_EXC +
        field(15, MOTIF_EXC_PERIOD_BITS);

    assert.throws(
        () => decode_project(bits_to_b64(bits)),
        /repeats a cell of no known length/
    );
});

test("a link writing its steps out of order is refused", () =>
{
    // The encoder writes the steps of a sparse row in ascending order, so a
    // link that doesn't has been edited by hand. Taking them in order is also
    // what stops one row from having two encodings.
    let bits =
        FOUR_STEP_ROW +
        GRID_SPARSE +
        field(2, SPARSE_COUNT_BITS) +       // two steps play
        field(2, 2) +                       // ...the third
        field(1, 2);                        // ...and then the second

    assert.throws(
        () => decode_project(bits_to_b64(bits)),
        /plays its steps out of order/
    );
});

test("a link playing a step its row does not have is refused", () =>
{
    // A three step row writes its steps in two bits, which can name a fourth
    // step the row hasn't got
    let bits =
        field(ENCODING_VERSION, VERSION_BITS) +
        field(80, TEMPO_BITS) +
        field(0, SWING_BITS) +
        '1' +                               // the delay is set the way it starts
        field(0, NUM_PATTERNS_BITS) +
        field(2, NUM_STEPS_BITS) +          // three steps
        field(0, NUM_ROWS_BITS) +           // one row
        '0' + field(0, SAMPLE_IDX_BITS) +   // sample index 0
        GRID_SPARSE +
        field(1, SPARSE_COUNT_BITS) +       // one step plays
        field(3, 2);                        // ...the fourth, of a three step row

    assert.throws(
        () => decode_project(bits_to_b64(bits)),
        /plays a step it does not have/
    );
});

//============================================================================
// Panning
//
// Where a row sits in the stereo field is guessed from the row at the same
// index of the previous pattern, and costs a single bit whenever that guess is
// right, which for most rows of most projects it is.
//============================================================================

test("every stereo position survives a round trip", () =>
{
    for (let pan = MIN_PAN; pan <= MAX_PAN; ++pan)
    {
        let project = make_project(120, [
            { sample_idxs: [0], rows: [[1, 0]] },
        ]);
        project.patterns[0].set_row_pan(0, pan);

        assert.equal(round_trip(project).patterns[0].pans[0], pan, `pan ${pan}`);
    }
});

test("a new row is in the centre and costs nothing to say so", () =>
{
    let centred = make_project(120, [{ sample_idxs: [0], rows: [[1, 0]] }]);
    let panned = make_project(120, [{ sample_idxs: [0], rows: [[1, 0]] }]);
    panned.patterns[0].set_row_pan(0, MAX_PAN);

    assert.equal(centred.patterns[0].pans[0], 0);
    assert.ok(
        encode_project(centred).length <= encode_project(panned).length,
        'a centred row should not cost more than a panned one'
    );
});

test("a row keeps its panning across patterns", () =>
{
    // The second pattern's row is panned the same way as the first's, which is
    // the guess the encoding makes, so this is about the guess being unpacked
    // as the value rather than as the centre
    let project = make_project(120, [
        { sample_idxs: [3], rows: [[1, 0]], lane: [1] },
        { sample_idxs: [3], rows: [[0, 1]], lane: [0, 1] },
    ]);

    project.patterns[0].set_row_pan(0, -7);
    project.patterns[1].set_row_pan(0, -7);

    let decoded = round_trip(project);

    assert.equal(decoded.patterns[0].pans[0], -7);
    assert.equal(decoded.patterns[1].pans[0], -7);
});

test("a row panned differently from the pattern before it survives", () =>
{
    let project = make_project(120, [
        { sample_idxs: [3], rows: [[1, 0]], lane: [1] },
        { sample_idxs: [3], rows: [[0, 1]], lane: [0, 1] },
    ]);

    project.patterns[0].set_row_pan(0, MIN_PAN);
    project.patterns[1].set_row_pan(0, MAX_PAN);

    let decoded = round_trip(project);

    assert.equal(decoded.patterns[0].pans[0], MIN_PAN);
    assert.equal(decoded.patterns[1].pans[0], MAX_PAN);
});

test("a link panning a row past hard over is refused", () =>
{
    // The pan field is wider than the positions a row can hold, so a link can
    // name one that isn't a position at all
    let bits =
        field(ENCODING_VERSION, VERSION_BITS) +
        field(80, TEMPO_BITS) +
        field(0, SWING_BITS) +
        '1' +                               // the delay is set the way it starts
        field(0, NUM_PATTERNS_BITS) +
        field(0, NUM_STEPS_BITS) +          // one step
        field(0, NUM_ROWS_BITS) +           // one row
        '0' + field(0, SAMPLE_IDX_BITS) +   // sample index 0
        GRID_LITERAL + '0' +               // the row's one cell, off
        '0' + field(31, PAN_BITS) +         // panned past MAX_PAN
        '1' +                               // at the level expected
        '1';                                // sending the delay what's expected

    decode_project(bits_to_b64(bits));

    assert.equal(drain_asserts().length, 1);
});

//============================================================================
// Levels
//
// A row's level is guessed the same way its panning is, and pays for itself
// only when the guess is wrong.
//============================================================================

test("every level survives a round trip", () =>
{
    for (let volume = MIN_VOLUME; volume <= MAX_VOLUME; ++volume)
    {
        let project = make_project(120, [
            { sample_idxs: [0], rows: [[1, 0]] },
        ]);
        project.patterns[0].set_row_volume(0, volume);

        assert.equal(round_trip(project).patterns[0].volumes[0], volume, `level ${volume}`);
    }
});

test("a row keeps its level across patterns", () =>
{
    let project = make_project(120, [
        { sample_idxs: [3], rows: [[1, 0]], lane: [1] },
        { sample_idxs: [3], rows: [[0, 1]], lane: [0, 1] },
    ]);

    project.patterns[0].set_row_volume(0, -9);
    project.patterns[1].set_row_volume(0, -9);

    let decoded = round_trip(project);

    assert.equal(decoded.patterns[0].volumes[0], -9);
    assert.equal(decoded.patterns[1].volumes[0], -9);
});

test("a row turned down in only one pattern survives", () =>
{
    let project = make_project(120, [
        { sample_idxs: [3], rows: [[1, 0]], lane: [1] },
        { sample_idxs: [3], rows: [[0, 1]], lane: [0, 1] },
    ]);

    project.patterns[1].set_row_volume(0, MIN_VOLUME);

    let decoded = round_trip(project);

    assert.equal(decoded.patterns[0].volumes[0], MAX_VOLUME);
    assert.equal(decoded.patterns[1].volumes[0], MIN_VOLUME);
});

test("a link setting a row past the top of the range is refused", () =>
{
    let bits =
        field(ENCODING_VERSION, VERSION_BITS) +
        field(80, TEMPO_BITS) +
        field(0, SWING_BITS) +
        '1' +                               // the delay is set the way it starts
        field(0, NUM_PATTERNS_BITS) +
        field(0, NUM_STEPS_BITS) +          // one step
        field(0, NUM_ROWS_BITS) +           // one row
        '0' + field(0, SAMPLE_IDX_BITS) +   // sample index 0
        GRID_LITERAL + '0' +               // the row's one cell, off
        '1' +                               // panned where it's expected
        '0' + field(31, VOLUME_BITS) +      // a level above MAX_VOLUME
        '1';                                // sending the delay what's expected

    decode_project(bits_to_b64(bits));

    assert.equal(drain_asserts().length, 1);
});

//============================================================================
// Delay
//
// How much of a row goes to the delay is guessed the way its panning and its
// level are. The delay's own settings belong to the project, and are guessed
// as a pair against the settings a project starts with, most projects never
// having touched them.
//============================================================================

test("every delay send survives a round trip", () =>
{
    for (let send = MIN_SEND; send <= MAX_SEND; ++send)
    {
        let project = make_project(120, [
            { sample_idxs: [0], rows: [[1, 0]] },
        ]);
        project.patterns[0].set_row_send(0, send);

        assert.equal(round_trip(project).patterns[0].sends[0], send, `send ${send}`);
    }
});

test("a new row is dry and costs nothing to say so", () =>
{
    let dry = make_project(120, [{ sample_idxs: [0], rows: [[1, 0]] }]);
    let sent = make_project(120, [{ sample_idxs: [0], rows: [[1, 0]] }]);
    sent.patterns[0].set_row_send(0, MAX_SEND);

    assert.equal(dry.patterns[0].sends[0], DEFAULT_SEND);
    assert.ok(
        encode_project(dry).length <= encode_project(sent).length,
        'a dry row should not cost more than one sent to the delay'
    );
});

test("a row keeps its delay send across patterns", () =>
{
    // The second pattern's row is sent as far as the first's, which is the
    // guess the encoding makes, so this is about the guess being unpacked as
    // the value rather than as a dry row
    let project = make_project(120, [
        { sample_idxs: [3], rows: [[1, 0]], lane: [1] },
        { sample_idxs: [3], rows: [[0, 1]], lane: [0, 1] },
    ]);

    project.patterns[0].set_row_send(0, -9);
    project.patterns[1].set_row_send(0, -9);

    let decoded = round_trip(project);

    assert.equal(decoded.patterns[0].sends[0], -9);
    assert.equal(decoded.patterns[1].sends[0], -9);
});

test("a row sent to the delay in only one pattern survives", () =>
{
    let project = make_project(120, [
        { sample_idxs: [3], rows: [[1, 0]], lane: [1] },
        { sample_idxs: [3], rows: [[0, 1]], lane: [0, 1] },
    ]);

    project.patterns[1].set_row_send(0, MAX_SEND);

    let decoded = round_trip(project);

    assert.equal(decoded.patterns[0].sends[0], DEFAULT_SEND);
    assert.equal(decoded.patterns[1].sends[0], MAX_SEND);
});

test("every delay setting survives a round trip", () =>
{
    for (let time = MIN_DELAY_TIME; time <= MAX_DELAY_TIME; ++time)
    {
        for (let fb = MIN_DELAY_FB; fb <= MAX_DELAY_FB; fb += DELAY_FB_STEP)
        {
            let project = make_project(120, [
                { sample_idxs: [0], rows: [[1, 0]] },
            ]);
            project.set_delay_time(time);
            project.set_delay_feedback(fb);

            let decoded = round_trip(project);

            assert.equal(decoded.delay_time, time, `time ${time}, feedback ${fb}`);
            assert.equal(decoded.delay_feedback, fb, `time ${time}, feedback ${fb}`);
        }
    }
});

test("a project that left the delay alone costs nothing to say so", () =>
{
    let untouched = make_project(120, [{ sample_idxs: [0], rows: [[1, 0]] }]);
    let set = make_project(120, [{ sample_idxs: [0], rows: [[1, 0]] }]);

    set.set_delay_time(MAX_DELAY_TIME);
    set.set_delay_feedback(MAX_DELAY_FB);

    assert.ok(
        encode_project(untouched).length <= encode_project(set).length,
        'a project at the default delay should not cost more than one that set it'
    );
});

test("a link setting a row past the top of the send range is refused", () =>
{
    let bits =
        field(ENCODING_VERSION, VERSION_BITS) +
        field(80, TEMPO_BITS) +
        field(0, SWING_BITS) +
        '1' +                               // the delay is set the way it starts
        field(0, NUM_PATTERNS_BITS) +
        field(0, NUM_STEPS_BITS) +          // one step
        field(0, NUM_ROWS_BITS) +           // one row
        '0' + field(0, SAMPLE_IDX_BITS) +   // sample index 0
        GRID_LITERAL + '0' +               // the row's one cell, off
        '1' +                               // panned where it's expected
        '1' +                               // at the level expected
        '0' + field(31, SEND_BITS);         // a send above MAX_SEND

    decode_project(bits_to_b64(bits));

    assert.equal(drain_asserts().length, 1);
});

//============================================================================
// Golden links
//
// These strings are frozen: a link that was shared has to keep opening as the
// project it was made from, forever. A failure here means already-shared links
// now decode differently, which is a change to make on purpose or not at all.
//
// Until the project is public there is nobody holding a link to break, so a
// failure here is re-frozen rather than versioned around: run the encoder and
// paste the new string in, having checked it decodes to what the tests below
// say it should. Once links are out in the world that stops being an option,
// and a change to the format has to move ENCODING_VERSION instead.
//
// The strings below are hand-written cases at the edges of the format. The
// links the corpus encodes to are pinned too, in tests/golden_links.js, and
// are regenerated by tools/update_golden.js rather than pasted in by hand.
//============================================================================

// A new project, untouched. This is the most-shared link there is, so it's
// worth pinning even though it ties this test to the sample table: its one
// surviving row plays the first of the samples handed to a new pattern. If
// that sample's index moves, every link ever shared breaks, and this is the
// test that says so.
const GOLDEN_EMPTY = 'untitled/BQBAPCBw';

// A single one-step pattern, its one cell on, placed once on the timeline
const GOLDEN_MINIMAL = 'untitled/BQBAAAAJ8A';

// Two patterns of different lengths, a title, a tempo, a swing and a delay off
// their defaults, the widest sample index the format holds, and both patterns
// on the timeline. One row of each pattern is panned off centre, one of each is
// turned down, and one of each is sent to the delay, so that this pins those
// fields too: the panning hard over and part of the way, the level part of the
// way down and all the way, and a send both guessed and written out.
const GOLDEN_MIXED = 'test_song/BkiXgIYgAFwFggMJUpAQP_McA3oA';

test("a new project encodes to the same link it always has", () =>
{
    assert.equal(project_to_hash(new Project()), GOLDEN_EMPTY);
});

test("the golden links still decode to the projects they were made from", () =>
{
    let minimal = project_from_hash(GOLDEN_MINIMAL);

    assert.equal(minimal.title, 'untitled');
    assert.equal(minimal.tempo, 120);
    assert.equal(minimal.swing, 50);
    assert.equal(minimal.num_patterns, 1);
    assert.deepEqual(minimal.patterns[0].sample_idxs, [0]);
    assert.deepEqual(minimal.patterns[0].rows, [[1]]);
    assert.deepEqual(minimal.lanes, [[1]]);

    let mixed = project_from_hash(GOLDEN_MIXED);

    assert.equal(mixed.title, 'test song');
    assert.equal(mixed.tempo, 140);
    assert.equal(mixed.swing, 67);
    assert.equal(mixed.delay_time, 11);
    assert.equal(mixed.delay_feedback, 60);
    assert.equal(mixed.num_patterns, 2);
    assert.deepEqual(mixed.patterns[0].sample_idxs, [0, 5]);
    assert.deepEqual(mixed.patterns[0].rows, [[1, 0, 1, 0], [0, 0, 0, 1]]);
    assert.deepEqual(mixed.patterns[0].pans, [0, MIN_PAN]);
    assert.deepEqual(mixed.patterns[0].volumes, [0, -6]);
    assert.deepEqual(mixed.patterns[0].sends, [DEFAULT_SEND, -12]);
    assert.deepEqual(mixed.patterns[1].sample_idxs, [2 ** SAMPLE_IDX_BITS - 1]);
    assert.deepEqual(mixed.patterns[1].rows, [[1, 1, 0]]);
    assert.deepEqual(mixed.patterns[1].pans, [4]);
    assert.deepEqual(mixed.patterns[1].volumes, [MIN_VOLUME]);
    assert.deepEqual(mixed.patterns[1].sends, [-3]);
    assert.deepEqual(mixed.lanes, [[1, 1, 0, 1], [0, 0, 1]]);
});

test("the golden links re-encode to themselves", () =>
{
    for (let hash of [GOLDEN_EMPTY, GOLDEN_MINIMAL, GOLDEN_MIXED])
        assert.equal(project_to_hash(project_from_hash(hash)), hash);
});

// The three strings above are hand-written cases. tests/golden_links.js is the
// other half of the freeze: a list that only grows, holding every link the
// encoding has been pinned to, which is where the fields the little cases
// don't reach get held down over songs that are shaped the way real ones are.
//
// An entry naming a song in the corpus is checked against that song in both
// directions. An entry naming nothing is a link that was shared before it was
// written down, so there is no hand-written project to check it against and it
// is held to a round trip instead.

test("every song in the corpus has a link pinned to it", () =>
{
    // A song added to the corpus without a link of its own would be carried
    // along by the tests below without any of them pinning it. The other
    // direction isn't checked: the list keeps links the corpus has moved on
    // from, which is what makes it a record of what has been shared rather
    // than a picture of what the encoder does today.
    let pinned = new Set(GOLDEN_LINKS.map(entry => entry.song));

    for (let song of CORPUS)
        assert(pinned.has(song.name), `no pinned link for ${song.name}`);
});

test("every song in the corpus encodes to a link that is pinned", () =>
{
    // Encoding a corpus song has to land on one of the links already written
    // down, i.e. on what that song has been shared as before. A song that
    // encodes to something new means the encoder writes something new, and
    // every link people are holding was written by the old one.
    let pinned = new Set(GOLDEN_LINKS.map(entry => entry.link));

    for (let song of CORPUS)
        assert(pinned.has(project_to_hash(build_song(song))), song.name);
});

test("every pinned link still opens as the song it was made from", () =>
{
    // The direction that matters once a link has been shared: the string is
    // fixed, and what the decoder makes of it has to be the song still. A
    // song comes back minus any row that plays nothing, the same as it would
    // from a round trip.
    //
    // Once ENCODING_VERSION has moved, a song has more than one link pinned to
    // it, and this is what says that every one of them still opens as that one
    // song however long ago it was written.
    let corpus = new Map(CORPUS.map(song => [song.name, song]));

    for (let { song, link } of GOLDEN_LINKS)
    {
        if (song === null)
            continue;

        assert(corpus.has(song), `pinned link names ${song}, which is not in the corpus`);
        assert_same_project(
            project_from_hash(link), as_encoded(build_song(corpus.get(song))), song);
    }
});

test("every pinned link decodes to the same song however often it is re-shared", () =>
{
    // What holds the links nobody has a hand-written project for. Opening one
    // and sharing what comes up has to give a link that opens as the same song
    // again, whatever the encoding has done in between: the string is allowed
    // to change, the song is not.
    for (let { song, link } of GOLDEN_LINKS)
    {
        let label = song ?? link;
        let opened = project_from_hash(link);
        let reopened = project_from_hash(project_to_hash(opened));

        assert_same_project(reopened, opened, label);

        // The corpus is all untitled, so the links from other people are the
        // only ones that carry a title through the encoding at all
        assert.equal(reopened.title, opened.title, `title of ${label}`);
    }
});

//============================================================================
// Encoding refuses what it cannot carry
//
// A value too wide for its field used to be written out with its high bits
// dropped, which produced a link that decoded cleanly into a project nobody
// made. It fails the encoding instead.
//============================================================================

test("a sample index too wide for its field is refused", () =>
{
    let project = make_project(120, [
        { sample_idxs: [2 ** SAMPLE_IDX_BITS], rows: [[1]] },
    ]);

    assert.throws(() => encode_project(project), RangeError);
});

test("a tempo outside the range the field holds is refused", () =>
{
    let project = make_project(120, [{ sample_idxs: [0], rows: [[1]] }]);

    // Set past set_tempo, the way a project decoded from a hand-edited link
    // or a future version of the format could arrive
    project.tempo = MAX_TEMPO + 1000;

    assert.throws(() => encode_project(project), RangeError);
});

test("a swing outside the range the field holds is refused", () =>
{
    let project = make_project(120, [{ sample_idxs: [0], rows: [[1]] }]);

    // Set past set_swing, as above. The field is wider than the range, so this
    // has to be well past the top of it to overflow.
    project.swing = MIN_SWING + 2 ** SWING_BITS;

    assert.throws(() => encode_project(project), RangeError);
});

test("more patterns than the field holds is refused", () =>
{
    let pats = Array.from({ length: 2 ** NUM_PATTERNS_BITS + 1 }, (_, i) => ({
        sample_idxs: [i % 2 ** SAMPLE_IDX_BITS],
        rows: [[1]],
    }));

    assert.throws(() => encode_project(make_project(120, pats)), RangeError);

    // encode_project states the same limit as a precondition of its own, which
    // is recorded rather than thrown. See tests/setup.js.
    assert.equal(drain_asserts().length, 1);
});

test("a value that isn't a whole number is refused", () =>
{
    let project = make_project(120, [{ sample_idxs: [1.5], rows: [[1]] }]);

    assert.throws(() => encode_project(project), RangeError);
});

test("a lane ending on an inactive cell is refused", () =>
{
    // A lane is written as blocks of active cells, so trailing silence leaves
    // it writing a block of no cells, i.e. a length of -1. Nothing in the app
    // builds a lane like this (toggle_lane_cell trims), but a lane assembled
    // by hand can be, and it would otherwise go out as a lane of the wrong
    // shape rather than as a failure.
    let project = make_project(120, [
        { sample_idxs: [0], rows: [[1]], lane: [1, 0, 0] },
    ]);

    assert.throws(() => encode_project(project), RangeError);
});

test("a project that fits encodes without complaint", () =>
{
    let project = make_project(MAX_TEMPO, [
        { sample_idxs: [2 ** SAMPLE_IDX_BITS - 1], rows: [Array(MAX_PAT_STEPS).fill(1)] },
    ]);

    assert.doesNotThrow(() => encode_project(project));
});

//============================================================================
// Decoding rejects what isn't a link
//
// A link can be truncated in a chat window or edited by hand, so the decoder
// has to turn anything that isn't ours into an error rather than a project.
//============================================================================

test("a link from a newer format version is refused", () =>
{
    let bits = field(ENCODING_VERSION + 1, VERSION_BITS) + ONE_EMPTY_PATTERN.slice(VERSION_BITS);

    assert.throws(
        () => decode_project(bits_to_b64(bits)),
        /unsupported encoding version/
    );
});

test("a truncated link is refused", () =>
{
    assert.throws(
        () => decode_project(bits_to_b64(field(ENCODING_VERSION, VERSION_BITS))),
        /unexpected end of encoded project data/
    );

    // Cut a real link short, the way a chat window would
    let data = GOLDEN_MIXED.split('/')[1];

    assert.throws(() => decode_project(data.slice(0, 4)), RangeError);
});

test("a link claiming an oversized value is refused", () =>
{
    // A gap running for more chunks than the longest song could need
    let bits = ONE_EMPTY_PATTERN + '1' + ('1' + field(0, VAR_CHUNK_BITS)).repeat(6);

    assert.throws(
        () => decode_project(bits_to_b64(bits)),
        /oversized value in encoded project data/
    );
});

test("a link whose timeline runs past the end of the song is refused", () =>
{
    // A block of MAX_SONG_STEPS + 1 cells, on a pattern one step long. Block
    // lengths are written one lower, since a block always holds a cell.
    let len = MAX_SONG_STEPS;
    let chunks = '';

    for (let val = len; val > 0; val = Math.floor(val / 2 ** VAR_CHUNK_BITS))
        chunks += '1' + field(val % 2 ** VAR_CHUNK_BITS, VAR_CHUNK_BITS);

    let bits = ONE_EMPTY_PATTERN +
        '1' +           // the pattern is placed somewhere
        '0' +           // no gap before the first block
        chunks + '0';   // the block's length

    assert.throws(
        () => decode_project(bits_to_b64(bits)),
        /runs past the end of the song/
    );
});

test("a fragment without a title separator is refused", () =>
{
    assert.throws(() => project_from_hash('BQAAAAYA'), SyntaxError);
});

test("a fragment that isn't base64 at all is refused", () =>
{
    assert.throws(() => project_from_hash('#untitled,not a link'));
});

//============================================================================
// Titles
//
// A title rides in the fragment beside the project data, where it's readable,
// which is what bounds what it's allowed to hold.
//============================================================================

test("a title survives a round trip through a fragment", () =>
{
    let project = new Project();
    project.title = 'my beat';

    let decoded = project_from_hash(project_to_hash(project));

    assert.equal(decoded.title, 'my beat');
});

test("a fragment can be read back with or without its leading hash", () =>
{
    let project = new Project();
    project.title = 'my beat';

    let hash = project_to_hash(project);

    assert.equal(project_from_hash('#' + hash).title, 'my beat');
    assert.equal(project_from_hash(hash).title, 'my beat');
});

test("a project without a title is shared as untitled", () =>
{
    assert.equal(encode_title(''), 'untitled');

    // A title that cleans away to nothing is a title that isn't there
    assert.equal(encode_title('   '), 'untitled');
    assert.equal(encode_title('~~~~'), 'untitled');

    // Note that this does not come back as the empty title it went in as: the
    // link says 'untitled', and reading one back takes it at its word, so the
    // title field shows the word rather than its placeholder
    assert.equal(decode_title('untitled'), 'untitled');
});

test("a title is written into the link with underscores for spaces", () =>
{
    assert.equal(encode_title('my beat'), 'my_beat');
    assert.equal(decode_title('my_beat'), 'my beat');

    // Which is why an underscore is not a character a title can hold: it would
    // come back as a space and there would be no telling the two apart
    assert.equal(encode_title('my_beat'), 'mybeat');
});

test("a title keeps the punctuation it is allowed to hold", () =>
{
    assert.equal(encode_title('Hello, World!'), 'Hello,_World!');
    assert.equal(encode_title("Rock 'n' Roll"), "Rock_'n'_Roll");
    assert.equal(encode_title('120bpm @ 4 4?'), '120bpm_@_4_4?');
    assert.equal(encode_title('A+B = C-D $1 x.y:z'), 'A+B_=_C-D_$1_x.y:z');
});

test("a title drops the characters that would not survive being posted", () =>
{
    // Markdown gives these meaning, and a link has to come out of a Markdown
    // renderer whole
    assert.equal(encode_title('a_b *c* ~d~ (e)'), 'ab_c_d_e');

    // An entity name is decoded even with nothing closing it, taking the rest
    // of the title with it
    assert.equal(encode_title('drum & bass'), 'drum_bass');
    assert.equal(encode_title('tom&copy'), 'tomcopy');

    // Not a fragment's to hold: a second '#', and an incomplete escape
    assert.equal(encode_title('C# 100%'), 'C_100');

    // The separator itself, which a title holding one would run into
    assert.equal(encode_title('4/4 swing'), '44_swing');

    // And a semicolon, which is where link detection on some clients decides
    // the URL has ended
    assert.equal(encode_title('a;b'), 'ab');

    assert.equal(encode_title('<script>alert(1)</script>'), 'scriptalert1script');
});

test("a title has its spaces tidied up on the way into a link", () =>
{
    assert.equal(encode_title('  spaced   out  '), 'spaced_out');
});

test("a title is cut to the length one is allowed to be", () =>
{
    assert.equal(encode_title('a'.repeat(50)), 'a'.repeat(MAX_TITLE_CHARS));

    // Cutting can land on a space, which would leave the title ending in the
    // underscore that space is written as
    let cut_on_space = 'a'.repeat(MAX_TITLE_CHARS - 1) + ' bbb';

    assert.equal(encode_title(cut_on_space), 'a'.repeat(MAX_TITLE_CHARS - 1));
});

test("a title that was cut survives a round trip as what it was cut to", () =>
{
    let project = new Project();
    project.title = 'a'.repeat(50);

    let decoded = project_from_hash(project_to_hash(project));

    assert.equal(decoded.title, 'a'.repeat(MAX_TITLE_CHARS));

    // A second trip through leaves it alone, having nothing left to cut
    assert.equal(project_to_hash(decoded), project_to_hash(project));
    assert.equal(project_from_hash(project_to_hash(decoded)).title, decoded.title);
});

test("a title held in a link is cut down rather than refused", () =>
{
    // A link can be edited by hand, and one that's been shared has to keep
    // opening, so what a link says is taken and trimmed rather than rejected
    assert.equal(decode_title('a'.repeat(50)), 'a'.repeat(MAX_TITLE_CHARS));

    // Including titles that making a link would have refused outright
    assert.equal(decode_title('ab'), 'ab');
    assert.equal(decode_title('...nope'), '...nope');
});

test("cleaning a title tidies it up without cutting it short", () =>
{
    assert.equal(clean_title('  Hello,   World!  '), 'Hello, World!');

    // Length is what separates this from normalize_title: a title has to be
    // measurable against both limits before anything is cut off it
    assert.equal(clean_title('a'.repeat(50)).length, 50);
});

//============================================================================
// What a title has to be
//
// Checked when a link is made, so that a title on its way to being long enough
// isn't an error the whole time it's being typed. A link that's already been
// shared is not held to this: see title_error in model.js.
//============================================================================

test("a title of the right length is accepted", () =>
{
    assert.equal(title_error('a'.repeat(MIN_TITLE_CHARS)), null);
    assert.equal(title_error('a'.repeat(MAX_TITLE_CHARS)), null);
    assert.equal(title_error('my beat'), null);
});

test("a title with nothing in it is refused", () =>
{
    assert.match(title_error(''), /at least 3 characters/);
    assert.match(title_error('    '), /at least 3 characters/);

    // Everything typed here is dropped as a character a title can't hold,
    // which leaves nothing behind
    assert.match(title_error('~~~~~~'), /at least 3 characters/);
});

test("a title shorter than the minimum is refused", () =>
{
    for (let len = 1; len < MIN_TITLE_CHARS; ++len)
        assert.match(title_error('a'.repeat(len)), /at least 3 characters/, `${len} chars`);

    // Spaces are collapsed and trimmed before the length is counted, so a
    // short title padded out with them is still short
    assert.match(title_error('   ab   '), /at least 3 characters/);
});

test("a title longer than the maximum is refused", () =>
{
    assert.match(
        title_error('a'.repeat(MAX_TITLE_CHARS + 1)),
        /at most 36 characters/
    );

    // The field is deliberately not capped, so this is what a long title
    // pasted into it comes to
    assert.match(title_error('a'.repeat(500)), /at most 36 characters/);
});

test("a title that opens on punctuation is refused", () =>
{
    for (let title of ['...and then', '@home jam', '!!! hey', "'round midnight"])
        assert.match(title_error(title), /start with a letter or a number/, title);

    // The check is on what's left after cleaning, so punctuation a title can't
    // hold at all doesn't count as its first character either
    assert.equal(title_error('~beat one'), null);
});

test("a title can open on a number", () =>
{
    // Plenty of tracks are named this way, so a digit opens a title as well as
    // a letter does
    for (let title of ['808 State', '4/4 groove', '1st take', '99 problems'])
        assert.equal(title_error(title), null, title);
});

test("a title opening on a letter is accepted whatever follows", () =>
{
    for (let title of ["Rock 'n' Roll", 'a.b.c.d', 'Take 2!', 'x/y @ 120?'])
        assert.equal(title_error(title), null, title);
});

test("what a title is measured on is what would go in the link", () =>
{
    // Characters a title can't hold are dropped before it's measured, so a
    // title made of them plus a few letters is measured on the letters
    let title = 'a#b~c%d';

    assert.equal(clean_title(title), 'abcd');
    assert.equal(title_error(title), null);

    let project = new Project();
    project.title = clean_title(title);

    assert.ok(project_to_hash(project).startsWith('abcd/'));
});

test("a title holding the separator cannot break the fragment apart", () =>
{
    let project = new Project();
    project.title = clean_title('a;b, c;d');

    // The semicolon is dropped, so the one in the fragment is the separator
    assert.equal(project.title, 'ab, cd');
    assert.equal(project_from_hash(project_to_hash(project)).title, 'ab, cd');
});
