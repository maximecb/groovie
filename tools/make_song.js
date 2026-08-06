#!/usr/bin/env node

// Turns a song written out as a file into a link that plays it.
//
// The song is written in the same form the corpus is, i.e. an object holding a
// tempo, a list of patterns and where each one is placed on the timeline, with
// the grids written a character per step. tests/corpus.js documents that form
// at the top and then works through song after song in it, which is the
// reference for writing one; the helpers it exports for laying out timeline
// lanes can be imported from a song file as well.
//
// The file has to export the song, either as its default export or under the
// name `song`. A minimal one:
//
//     export default {
//         name: 'a four to the floor',
//         tempo: 124,
//         song_bars: 2,
//         patterns: [
//             {
//                 samples: ['kick_01', 'hat_closed_01'],
//                 rows: [
//                     'x...x...x...x...',
//                     '..x...x...x...x.',
//                 ],
//                 lane: 'xx',
//             },
//         ],
//     };
//
// Run it with `node tools/make_song.js <file>` from anywhere in the repo. It
// prints a link to open the song locally and a link to open it on the site.
//
// What it mostly does is refuse to print a link that isn't one. The model
// states its preconditions with console.assert, which only prints, so a song
// holding a level or a tempo outside what can be encoded would otherwise come
// back as a link that opens as something other than what was written. Those
// are turned into failures here, along with the things the model has no reason
// to check: a sample that doesn't exist, rows of different lengths, a song that
// doesn't run for as long as it says.

import { pathToFileURL } from "node:url";
import path from "node:path";

//============================================================================
// Failing on what the model only prints about
//
// This has to be done before anything else is imported: the model asserts
// while its own module is being evaluated, and a song file is imported further
// down, which builds patterns as it goes.
//============================================================================

// Assertion failures seen while building the song, in the order they happened.
// They're collected rather than thrown on, the way tests/setup.js collects
// them: throwing out of a setter would leave the song half-built and report
// the first thing wrong with it instead of everything wrong with it.
let assert_fails = [];

const real_assert = console.assert;

console.assert = function (cond, ...args)
{
    if (!cond)
        assert_fails.push(args.length? args.join(' ') : 'assertion failed');

    real_assert.call(console, cond, ...args);
};

const { CORPUS, build_song } = await import("../tests/corpus.js");
const { SAMPLE_MAP } = await import("../sample_list.js");

const {
    project_to_hash,
    project_from_hash,
    clean_title,
    title_error,
    STEPS_PER_BAR,
    MIN_PAT_STEPS,
    MAX_PAT_STEPS,
    MAX_PAT_ROWS,
    MAX_PATTERNS,
    MIN_TEMPO,
    MAX_TEMPO,
    MIN_SWING,
    MAX_SWING,
    MIN_HUMANIZE,
    MAX_HUMANIZE,
    MIN_PAN,
    MAX_PAN,
    MIN_VOLUME,
    MAX_VOLUME,
    MIN_SEND,
    MAX_SEND,
    MIN_DELAY_TIME,
    MAX_DELAY_TIME,
    MIN_DELAY_FB,
    MAX_DELAY_FB,
    DELAY_FB_STEP,
} = await import("../model.js");

//============================================================================
// Where the links point
//============================================================================

// Where tools/dev_server.py serves the app, which is where a song is opened
// while it's being worked on
const LOCAL_URL = 'http://localhost:8001/';

// Where the app is published. A fragment carries the whole song and is never
// sent to a server, so this link plays exactly what the local one does; it is
// the one to send somebody.
const SITE_URL = 'https://maximecb.github.io/groovie/';

// How long a URL can get before it stops surviving the places projects get
// shared in, mirrored from main.js (see design.md)
const MAX_URL_CHARS = 2000;

//============================================================================
// Reading the song
//============================================================================

// Names every sample the app has, which is what a song's rows are named from
const sample_names = new Set(
    Object.keys(SAMPLE_MAP).map(sample_path =>
        sample_path.match(/samples\/(.+)\.wav/)[1])
);

function fail(msg)
{
    console.error(`Error: ${msg}`);
    process.exit(1);
}

// Say what a sample might have been meant to be, so that a name off by a
// suffix says what the suffixes are rather than only that it isn't one
function near_names(name)
{
    let stem = name.replace(/_?\d+$/, '');

    let near = [...sample_names].filter(
        other => other.startsWith(stem) || stem.startsWith(other.replace(/_?\d+$/, ''))
    );

    return near.length? ` Did you mean: ${near.slice(0, 6).join(', ')}?` : '';
}

// Check a value the model would only assert about. The assertions are caught
// too, but they are the model talking to whoever is reading the model: they
// carry no message, so a level out of range comes back as "assertion failed"
// rather than as which row was set to what.
function check_range(value, min, max, what)
{
    if (typeof value != 'number' || !Number.isFinite(value))
        fail(`${what} is ${JSON.stringify(value)}, which is not a number.`);

    if (value < min || value > max)
        fail(`${what} is ${value}, and it runs from ${min} to ${max}.`);
}

// Check the things the model has no reason to check, before it is handed
// anything. What the model does check is caught by the assertions above, but
// only once it has been given a pattern to check, and a row list that doesn't
// line up with its sample list produces a pattern that is wrong rather than
// one that is refused.
function check_song(song)
{
    if (!song || typeof song != 'object')
        fail('the file does not export a song object.');

    for (let field of ['name', 'tempo', 'song_bars', 'patterns'])
        if (song[field] === undefined)
            fail(`the song has no '${field}'.`);

    if (!Array.isArray(song.patterns) || song.patterns.length == 0)
        fail('the song has no patterns.');

    if (song.patterns.length > MAX_PATTERNS)
        fail(`the song has ${song.patterns.length} patterns, and at most ` +
             `${MAX_PATTERNS} can be encoded.`);

    check_range(song.tempo, MIN_TEMPO, MAX_TEMPO, 'the tempo');

    if (song.swing !== undefined)
        check_range(song.swing, MIN_SWING, MAX_SWING, 'the swing');

    if (song.humanize !== undefined)
        check_range(song.humanize, MIN_HUMANIZE, MAX_HUMANIZE, 'the humanize');

    if (song.delay_time !== undefined)
        check_range(song.delay_time, MIN_DELAY_TIME, MAX_DELAY_TIME,
                    'the delay time');

    if (song.delay_feedback !== undefined)
    {
        check_range(song.delay_feedback, MIN_DELAY_FB, MAX_DELAY_FB,
                    'the delay feedback');

        // Only the settings the control stops at can be encoded, so a value
        // between two of them is a value the link has no room for
        if (song.delay_feedback % DELAY_FB_STEP)
            fail(`the delay feedback is ${song.delay_feedback}, and it is set ` +
                 `in steps of ${DELAY_FB_STEP}.`);
    }

    // A title travels in the link and names the track wherever it's posted, so
    // a name that can't be one is worth saying before the link is made rather
    // than leaving it to come out mangled
    let title_err = title_error(song.name);

    if (title_err)
        fail(`the song name can't be shared as a title. ${title_err}`);

    if (clean_title(song.name) != song.name)
        fail(`the song name holds characters a title can't carry. It would ` +
             `be shared as '${clean_title(song.name)}'.`);

    song.patterns.forEach((pat, pat_idx) =>
    {
        let where = `pattern ${pat_idx + 1}`;

        for (let field of ['samples', 'rows'])
            if (!Array.isArray(pat[field]))
                fail(`${where} has no '${field}' list.`);

        if (pat.samples.length != pat.rows.length)
            fail(`${where} names ${pat.samples.length} samples but has ` +
                 `${pat.rows.length} rows. There is one row per sample.`);

        if (pat.rows.length > MAX_PAT_ROWS)
            fail(`${where} has ${pat.rows.length} rows, and a pattern holds ` +
                 `at most ${MAX_PAT_ROWS}.`);

        for (let name of pat.samples)
            if (!sample_names.has(name))
                fail(`${where} plays '${name}', which is not a sample.` +
                     near_names(name));

        // Every row of a pattern is the same grid, so a row of its own length
        // is a typo rather than a shorter row: the model would take the first
        // row's length as the pattern's and read the rest against it
        let num_steps = pat.rows[0].length;

        pat.rows.forEach((row, row_idx) =>
        {
            if (row.length != num_steps)
                fail(`${where} row ${row_idx + 1} (${pat.samples[row_idx]}) is ` +
                     `${row.length} steps, and row 1 is ${num_steps}. Every row ` +
                     `of a pattern is the same length.`);

            let bad = row.replace(/[x.]/g, '');

            if (bad.length)
                fail(`${where} row ${row_idx + 1} (${pat.samples[row_idx]}) holds ` +
                     `'${bad[0]}'. A step is 'x' to play and '.' to stay quiet.`);
        });

        if (num_steps < MIN_PAT_STEPS || num_steps > MAX_PAT_STEPS)
            fail(`${where} is ${num_steps} steps, and a pattern runs between ` +
                 `${MIN_PAT_STEPS} and ${MAX_PAT_STEPS}.`);

        // What a row can be set to, each named the way the song writes it
        let row_ranges = {
            pans: [MIN_PAN, MAX_PAN, 'stereo position'],
            volumes: [MIN_VOLUME, MAX_VOLUME, 'level'],
            sends: [MIN_SEND, MAX_SEND, 'delay send'],
        };

        for (let [field, [min, max, label]] of Object.entries(row_ranges))
        {
            if (!pat[field])
                continue;

            if (pat[field].length != pat.rows.length)
                fail(`${where} gives ${pat[field].length} ${field} for ` +
                     `${pat.rows.length} rows. A pattern that sets them sets ` +
                     `one per row.`);

            pat[field].forEach((value, row_idx) =>
                check_range(value, min, max,
                    `${where} row ${row_idx + 1} (${pat.samples[row_idx]}): the ${label}`));
        }

        if (pat.lane === undefined)
            fail(`${where} is not placed on the timeline. Give it a 'lane'.`);
    });
}

//============================================================================
// Building it
//============================================================================

let args = process.argv.slice(2).filter(arg => arg != '--help' && arg != '-h');
let want_help = args.length != process.argv.length - 2;

if (want_help || args.length != 1)
{
    // The comment block at the top of this file, which is the documentation,
    // read up to wherever it happens to end
    let src = await import("node:fs").then(fs =>
        fs.readFileSync(new URL(import.meta.url), 'utf8'));

    for (let line of src.split('\n').slice(2))
    {
        if (!line.startsWith('//'))
            break;

        console.log(line.replace(/^\/\/ ?/, ''));
    }

    process.exit(want_help? 0 : 1);
}

let song_path = path.resolve(args[0]);
let module_url = pathToFileURL(song_path).href;
let song_module;

try
{
    song_module = await import(module_url);
}
catch (err)
{
    fail(`could not read ${args[0]}: ${err.message}`);
}

let song = song_module.default ?? song_module.song;

check_song(song);

// Anything the model itself refused is reported here, all of it at once. It
// says what was wrong rather than which line said it: the assertions are the
// model's own, and are written for somebody reading the model.
let project = build_song(song);

if (assert_fails.length)
{
    console.error(`Error: the song holds ${assert_fails.length} value(s) that ` +
                  `can't be encoded:`);

    for (let msg of new Set(assert_fails))
        console.error(`  ${msg}`);

    console.error();
    console.error('Ranges: pan -10 to 10, volume and delay send -30 to 0 dB,');
    console.error('tempo 40 to 280, swing 50 to 75, humanize 0 to 31,');
    console.error('delay feedback 0 to 75 in 5s.');
    process.exit(1);
}

// A song states how long it runs, and the lanes are what actually decide it.
// The two disagreeing means a lane stops short of where the song was meant to
// end, or runs past it, which is worth catching here: it plays as silence at
// one end rather than as anything obviously wrong.
let song_steps = project.song_num_steps;
let want_steps = song.song_bars * STEPS_PER_BAR;

if (song_steps != want_steps)
{
    fail(`the song says it runs for ${song.song_bars} bars (${want_steps} steps) ` +
         `but its lanes run for ${song_steps} steps ` +
         `(${(song_steps / STEPS_PER_BAR).toFixed(2)} bars). ` +
         `A lane is one cell per playthrough of its own pattern.`);
}

//============================================================================
// Saying where it is
//============================================================================

project.title = song.name;

let hash = project_to_hash(project);
let local_url = LOCAL_URL + '#' + hash;
let site_url = SITE_URL + '#' + hash;

// The link is the song, so a link that doesn't read back as the song it was
// made from is worth catching before it is handed to anybody
if (project_to_hash(project_from_hash(hash)) != hash)
    fail('the song does not survive being encoded. This is a bug in the encoding.');

// Both links carry the same fragment, so it is the longer of the two that has
// to stay under the limit
if (site_url.length > MAX_URL_CHARS)
{
    fail(`the link is ${site_url.length} characters, over the ${MAX_URL_CHARS} ` +
         `a shared link should stay under. Shorten the song, or give it fewer ` +
         `or shorter patterns.`);
}

let secs = song_steps / project.steps_per_sec;

console.log();
console.log(`  ${song.name}`);
console.log();
console.log(`  local:  ${local_url}`);
console.log();
console.log(`  public: ${site_url}`);
console.log();
console.log(`  ${project.num_patterns} pattern(s), ${song.song_bars} bars ` +
            `(${song_steps} steps), ${secs.toFixed(1)}s at ${project.tempo} BPM`);
console.log(`  link is ${site_url.length} characters of ${MAX_URL_CHARS}`);
console.log();

// The corpus is the yardstick the encoding is measured against rather than a
// place to keep songs, so a song made here is not added to it. Saying so where
// it would otherwise be tempting is cheaper than a comment nobody reads.
if (CORPUS.some(other => other.name == song.name))
    console.log(`  Note: the corpus already holds a song called '${song.name}'.`);
