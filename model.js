import { get_sample_idx } from "./audio.js";

//============================================================================
// Limits
//
// These bound what a project can contain, and so also determine how many bits
// each field takes in the URL encoding below.
//
// The model refers to samples only by index, and never needs to know what a
// given index means. The one thing that bounds a sample index is the width of
// the field it's encoded in, which is a property of the format rather than of
// whatever happens to be in the samples directory today.
//============================================================================

// A beat is 4 steps, so at 120 BPM there are 8 steps per second
export const STEPS_PER_BEAT = 4;

// Tempo range, in beats per minute
export const MIN_TEMPO = 40;
export const MAX_TEMPO = 220;
export const DEFAULT_TEMPO = 120;

// Pattern length, in steps
export const MIN_PAT_STEPS = 1;
export const MAX_PAT_STEPS = 64;
export const DEFAULT_PAT_STEPS = 16;

// A pattern has one row per sample, and the number of rows is variable
export const MIN_PAT_ROWS = 1;
export const MAX_PAT_ROWS = 16;

// Number of patterns a project can hold
export const MAX_PATTERNS = 64;

// Samples used by a newly created pattern
const DEFAULT_SAMPLES = [
    'kick_01',
    'snare_01',
    'hat_closed_01',
    'hat_open_01',
    'clap_01',
];

//============================================================================
// Project state
//============================================================================

// One pattern of the project, i.e. a grid of steps with one row per sample
export class Pattern
{
    constructor(sample_idxs, num_steps = DEFAULT_PAT_STEPS)
    {
        console.assert(sample_idxs.length >= MIN_PAT_ROWS);
        console.assert(sample_idxs.length <= MAX_PAT_ROWS);
        console.assert(num_steps >= MIN_PAT_STEPS);
        console.assert(num_steps <= MAX_PAT_STEPS);

        // Pattern length, in steps. Steps have a fixed duration, so a shorter
        // pattern is shorter in time, not slower. Patterns of different lengths
        // phase against each other (see design.md).
        this.num_steps = num_steps;

        // Sample associated with each row. A pattern has one row per sample,
        // and the number of rows is variable.
        this.sample_idxs = sample_idxs;

        // Grid cells, one row of steps per sample
        this.rows = sample_idxs.map(() => Array(num_steps).fill(0));
    }

    // Create a pattern with the default set of samples
    static with_default_samples()
    {
        return new Pattern(DEFAULT_SAMPLES.map(get_sample_idx));
    }

    // Number of rows in this pattern, i.e. the number of samples it plays
    get num_rows()
    {
        return this.sample_idxs.length;
    }

    // Test if the cell at a given row and step is active
    get_cell(row_idx, step_idx)
    {
        return this.rows[row_idx][step_idx];
    }

    // Toggle the cell at a given row and step, returns the new value
    toggle_cell(row_idx, step_idx)
    {
        let cell_on = !this.rows[row_idx][step_idx];
        this.rows[row_idx][step_idx] = cell_on? 1:0;
        return cell_on;
    }

    // Change the pattern length, preserving the cells that still fit
    set_num_steps(num_steps)
    {
        console.assert(num_steps >= MIN_PAT_STEPS);
        console.assert(num_steps <= MAX_PAT_STEPS);

        for (let row of this.rows)
        {
            let old_steps = row.length;
            row.length = num_steps;

            // Growing the pattern leaves the new cells empty
            if (num_steps > old_steps)
                row.fill(0, old_steps);
        }

        this.num_steps = num_steps;
    }

    // Set the sample played by a given row
    set_row_sample(row_idx, sample_idx)
    {
        console.assert(row_idx < this.num_rows);
        console.assert(sample_idx < 2 ** SAMPLE_IDX_BITS);
        this.sample_idxs[row_idx] = sample_idx;
    }
}

// A project, i.e. everything that gets shared through a URL
export class Project
{
    constructor()
    {
        this.title = 'untitled';

        // Tempo, in beats per minute
        this.tempo = DEFAULT_TEMPO;

        this.patterns = [Pattern.with_default_samples()];

        // TODO: the timeline/song arrangement lives here too, once it exists.
        // The encoding is versioned so that it can be added without breaking
        // links shared before then.
    }

    set_tempo(tempo)
    {
        console.assert(tempo >= MIN_TEMPO);
        console.assert(tempo <= MAX_TEMPO);
        this.tempo = tempo;
    }

    // Playback rate, in steps per second. Steps have a fixed duration, so this
    // is what the tempo actually controls.
    get steps_per_sec()
    {
        return this.tempo * STEPS_PER_BEAT / 60;
    }
}

//============================================================================
// URL encoding
//
// Projects are shared by encoding them into the fragment portion of the URL,
// as `#<title>,<base64url data>`. The data is a bit-packed representation of
// the project. This is deliberately a simple scheme to start with, and can be
// made more clever about compression later (see design.md); the version field
// makes it possible to change it without breaking already-shared links.
//============================================================================

// Version of the encoding format
const ENCODING_VERSION = 0;

// Number of bits used for each field
const VERSION_BITS = 4;
const TEMPO_BITS = 8;
const NUM_PATTERNS_BITS = 6;
const NUM_STEPS_BITS = 6;
const NUM_ROWS_BITS = 4;
const SAMPLE_IDX_BITS = 9;

console.assert(MAX_TEMPO - MIN_TEMPO < (1 << TEMPO_BITS));
console.assert(MAX_PATTERNS <= (1 << NUM_PATTERNS_BITS));
console.assert(MAX_PAT_STEPS <= (1 << NUM_STEPS_BITS));
console.assert(MAX_PAT_ROWS <= (1 << NUM_ROWS_BITS));

// Writes unsigned integer fields into a bit string, most significant bit first
class BitWriter
{
    constructor()
    {
        this.bytes = [];
        this.num_bits = 0;
    }

    write(val, num_bits)
    {
        console.assert(Number.isInteger(val));
        console.assert(val >= 0 && val < 2 ** num_bits);

        for (let i = num_bits - 1; i >= 0; --i)
        {
            // Start a new byte when the current one is full
            if (this.num_bits % 8 == 0)
                this.bytes.push(0);

            let bit = (val >> i) & 1;
            this.bytes[this.bytes.length - 1] |= bit << (7 - this.num_bits % 8);
            this.num_bits++;
        }
    }

    to_base64url()
    {
        let str = String.fromCharCode(...this.bytes);

        // base64url differs from base64 in its last two characters,
        // and drops the padding, which is not needed to decode
        return btoa(str)
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '');
    }
}

// Reads back the fields written by a BitWriter
class BitReader
{
    constructor(b64_str)
    {
        let str = atob(b64_str.replaceAll('-', '+').replaceAll('_', '/'));

        this.bytes = Array.from(str, ch => ch.charCodeAt(0));
        this.num_bits = 0;
    }

    read(num_bits)
    {
        let val = 0;

        for (let i = 0; i < num_bits; ++i)
        {
            if (this.num_bits >= 8 * this.bytes.length)
                throw RangeError('unexpected end of encoded project data');

            let byte = this.bytes[this.num_bits >> 3];
            let bit = (byte >> (7 - this.num_bits % 8)) & 1;
            val = (val << 1) | bit;
            this.num_bits++;
        }

        return val;
    }
}

// Encode a project into a base64url string
export function encode_project(project)
{
    console.assert(project.patterns.length <= MAX_PATTERNS);

    let writer = new BitWriter();

    writer.write(ENCODING_VERSION, VERSION_BITS);
    writer.write(project.tempo - MIN_TEMPO, TEMPO_BITS);
    writer.write(project.patterns.length - 1, NUM_PATTERNS_BITS);

    for (let pat of project.patterns)
    {
        writer.write(pat.num_steps - 1, NUM_STEPS_BITS);
        writer.write(pat.num_rows - 1, NUM_ROWS_BITS);

        for (let row_idx = 0; row_idx < pat.num_rows; ++row_idx)
        {
            writer.write(pat.sample_idxs[row_idx], SAMPLE_IDX_BITS);

            // One bit per step of this row
            for (let step_idx = 0; step_idx < pat.num_steps; ++step_idx)
                writer.write(pat.rows[row_idx][step_idx]? 1:0, 1);
        }
    }

    return writer.to_base64url();
}

// Decode a project from a base64url string.
// Throws if the string is not valid encoded project data.
export function decode_project(b64_str)
{
    let reader = new BitReader(b64_str);

    let version = reader.read(VERSION_BITS);
    if (version != ENCODING_VERSION)
        throw RangeError(`unsupported encoding version ${version}`);

    let project = new Project();
    project.set_tempo(MIN_TEMPO + reader.read(TEMPO_BITS));

    let num_patterns = reader.read(NUM_PATTERNS_BITS) + 1;
    project.patterns = [];

    for (let pat_idx = 0; pat_idx < num_patterns; ++pat_idx)
    {
        let num_steps = reader.read(NUM_STEPS_BITS) + 1;
        let num_rows = reader.read(NUM_ROWS_BITS) + 1;

        let sample_idxs = [];
        let rows = [];

        for (let row_idx = 0; row_idx < num_rows; ++row_idx)
        {
            // An index with no sample behind it is not an error: indices are
            // reserved permanently, so a project shared before a sample was
            // removed must still load, minus the row that used it
            sample_idxs.push(reader.read(SAMPLE_IDX_BITS));

            let row = [];
            for (let step_idx = 0; step_idx < num_steps; ++step_idx)
                row.push(reader.read(1));
            rows.push(row);
        }

        let pat = new Pattern(sample_idxs, num_steps);
        pat.rows = rows;
        project.patterns.push(pat);
    }

    return project;
}

// Strip the characters that don't survive being pasted around in a URL,
// so that the title stays readable in the link
function encode_title(title)
{
    return title.trim().replaceAll(/[^A-Za-z0-9_-]+/g, '_');
}

// Encode a project into a URL fragment, without the leading '#'
export function project_to_hash(project)
{
    // TODO: here we should be logging the total project encoding length to the console

    return `${encode_title(project.title)},${encode_project(project)}`;
}

// Decode a project from a URL fragment, with or without the leading '#'.
// Throws if the fragment is not a valid encoded project.
export function project_from_hash(hash)
{
    if (hash.startsWith('#'))
        hash = hash.substring(1);

    let sep_idx = hash.indexOf(',');
    if (sep_idx == -1)
        throw SyntaxError('missing separator between title and project data');

    let project = decode_project(hash.substring(sep_idx + 1));
    project.title = hash.substring(0, sep_idx);

    return project;
}
