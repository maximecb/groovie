#!/usr/bin/env node

// Measures what the songs in tests/corpus.js encode to.
//
// This is the yardstick for changing the encoding: run it before a change and
// after it, and compare the bytes column. A compression scheme that wins on
// one song and loses on another is what the corpus is there to show, so the
// per-song rows matter as much as the total.
//
// Run it with `node tools/link_sizes.js` from anywhere in the repo.

import { CORPUS, build_song } from "../tests/corpus.js";
import { encode_project, project_to_hash } from "../model.js";

// How long a URL can get before it stops being dependable in the places
// projects get shared, mirrored from main.js (see design.md)
const MAX_URL_CHARS = 2000;

// What the links below are built against, i.e. where tools/dev_server.py
// serves the app. The URL column is measured against this too, so it is a
// figure for a link opened locally rather than for one shared from wherever
// the app ends up hosted; the fragment is the part that doesn't vary.
const BASE_URL = 'http://localhost:8001/';

// Number of bytes behind a base64url string, which carries 3 of them per 4
// characters and drops the padding that would round it out
function b64_bytes(str)
{
    return Math.floor(str.length * 3 / 4);
}

// What one song costs, both as the encoding sees it and as a link
function measure(song)
{
    let project = build_song(song);

    // A title travels in the link, so a realistic link length includes one.
    // The corpus names are about as long as a title people give a track.
    project.title = song.name;

    let data = encode_project(project);
    let url = BASE_URL + '#' + project_to_hash(project);

    // What the pattern grids cost under the current scheme, which spends one
    // bit per cell whether the cell plays or not. This is the number a
    // compression scheme is trying to beat, and the one to watch beside the
    // total: everything else in a link is headers and timeline.
    let cell_bits = 0;
    let active_cells = 0;

    for (let pat of project.patterns)
    {
        cell_bits += pat.num_steps * pat.num_rows;

        for (let row of pat.rows)
            active_cells += row.reduce((a, b) => a + b, 0);
    }

    return {
        name: song.name,
        patterns: project.num_patterns,
        song_steps: project.song_num_steps,
        cell_bits: cell_bits,
        active_cells: active_cells,
        bytes: b64_bytes(data),
        url_chars: url.length,
        url: url,
    };
}

const COLUMNS = [
    { head: 'song',      key: 'name',         width: 30, left: true },
    { head: 'patterns',  key: 'patterns',     width: 9 },
    { head: 'steps',     key: 'song_steps',   width: 7 },
    { head: 'cells',     key: 'active_cells', width: 7 },
    { head: 'cell bits', key: 'cell_bits',    width: 10 },
    { head: 'bytes',     key: 'bytes',        width: 7 },
    { head: 'URL',       key: 'url_chars',    width: 7 },
];

function row_text(vals)
{
    return COLUMNS.map(col =>
    {
        let text = String(vals[col.key]);
        return col.left? text.padEnd(col.width) : text.padStart(col.width);
    }).join('');
}

let rows = CORPUS.map(measure);
let rule = '-'.repeat(COLUMNS.reduce((sum, col) => sum + col.width, 0));

// The links first, so that a song can be opened before reading what it costs.
// Each one names its own song in its fragment, so nothing else has to.
console.log();

for (let row of rows)
    console.log(row.url);

console.log();
console.log(row_text(Object.fromEntries(COLUMNS.map(col => [col.key, col.head]))));
console.log(rule);

for (let row of rows)
    console.log(row_text(row));

console.log(rule);

// The total is what a change to the encoding is judged on, since a scheme that
// only helps the biggest song is still worth having
const sum = key => rows.reduce((total, row) => total + row[key], 0);

console.log(row_text({
    name: `${rows.length} songs`,
    patterns: sum('patterns'),
    song_steps: sum('song_steps'),
    active_cells: sum('active_cells'),
    cell_bits: sum('cell_bits'),
    bytes: sum('bytes'),
    url_chars: sum('url_chars'),
}));

console.log();

// Say how the longest link is doing against the budget, which is the limit
// that decides whether a song can be shared at all
let widest = rows.reduce((a, b) => a.url_chars > b.url_chars? a : b);
let pct = (100 * widest.url_chars / MAX_URL_CHARS).toFixed(1);

console.log(`longest link: ${widest.name}, ` +
            `${widest.url_chars} of ${MAX_URL_CHARS} chars (${pct}%)`);
console.log();
