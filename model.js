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

// A bar is 4 beats, i.e. 16 steps. Playback doesn't depend on bars at all:
// they're a reference for the timeline, which shows a ruler in bars and ends
// the song on a bar boundary.
export const STEPS_PER_BAR = 4 * STEPS_PER_BEAT;

// Song length, in steps. The song has no length of its own: it ends at the
// last pattern placed on the timeline (see design.md), and this is how far the
// timeline can be extended.
export const MAX_SONG_STEPS = 16384;

// Tempo range, in beats per minute. The top end is well past what a groove
// sits at, so that the fast genres (drum and bass, hardcore, footwork) can be
// written at the tempo they're counted in rather than at half of it.
export const MIN_TEMPO = 40;
export const MAX_TEMPO = 280;
export const DEFAULT_TEMPO = 120;

// Pattern length, in steps
export const MIN_PAT_STEPS = 1;
export const MAX_PAT_STEPS = 64;
export const DEFAULT_PAT_STEPS = 16;

// A pattern has one row per sample, and the number of rows is variable
export const MIN_PAT_ROWS = 1;
export const MAX_PAT_ROWS = 16;
export const DEFAULT_PAT_ROWS = 6;

// Number of patterns a project can hold
export const MAX_PATTERNS = 64;

// Samples handed out to pattern rows, in order. A new pattern starts with the
// first few of these, and a row added later takes the first one the pattern
// isn't playing yet, so that a grown pattern is a usable kit rather than a
// stack of the same sample. There are as many of these as a pattern has rows,
// which is what guarantees an unused one is always left to hand out.
const ROW_SAMPLES = [
    'kick_01',
    'snare_01',
    'hat_closed_01',
    'hat_open_01',
    'clap_01',
    'rimshot_01',
    'tom_low_01',
    'tom_mid_01',
    'tom_hi_01',
    'cowbell_01',
    'claves_01',
    'ride_01',
    'crash_01',
    'maracas_01',
    'perc_01',
    'bongo_01',
];

console.assert(ROW_SAMPLES.length == MAX_PAT_ROWS);

// Samples used by a newly created pattern
const DEFAULT_SAMPLES = ROW_SAMPLES.slice(0, DEFAULT_PAT_ROWS);

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

    // Add a row at the bottom of the pattern, playing a given sample.
    // Returns false if the pattern already holds as many rows as it can.
    add_row(sample_idx)
    {
        console.assert(sample_idx < 2 ** SAMPLE_IDX_BITS);

        if (this.num_rows >= MAX_PAT_ROWS)
            return false;

        this.sample_idxs.push(sample_idx);
        this.rows.push(Array(this.num_steps).fill(0));

        return true;
    }

    // Sample to give a newly added row, i.e. the first one this pattern isn't
    // playing yet. The fallback is unreachable while there are at least as many
    // ROW_SAMPLES as a pattern can have rows.
    next_row_sample()
    {
        for (let sample_name of ROW_SAMPLES)
        {
            let sample_idx = get_sample_idx(sample_name);

            if (!this.sample_idxs.includes(sample_idx))
                return sample_idx;
        }

        return get_sample_idx(ROW_SAMPLES[0]);
    }

    // Set the sample played by a given row
    set_row_sample(row_idx, sample_idx)
    {
        console.assert(row_idx < this.num_rows);
        console.assert(sample_idx < 2 ** SAMPLE_IDX_BITS);
        this.sample_idxs[row_idx] = sample_idx;
    }

    // Test if a row has no active step, i.e. plays nothing
    row_is_inactive(row_idx)
    {
        return this.rows[row_idx].every(cell => !cell);
    }

    // Test if the whole pattern has no active step, i.e. plays nothing
    is_inactive()
    {
        for (let row_idx = 0; row_idx < this.num_rows; ++row_idx)
        {
            if (!this.row_is_inactive(row_idx))
                return false;
        }

        return true;
    }

    // Produce an independent copy of this pattern
    copy()
    {
        let pat = new Pattern(this.sample_idxs.slice(), this.num_steps);
        pat.rows = this.rows.map(row => row.slice());

        return pat;
    }

    // Produce an empty pattern with the same samples and length as this one.
    // A newly created pattern is made this way rather than from the default
    // samples: samples live on pattern rows, so starting from the defaults
    // would throw away whatever kit the user has assembled.
    empty_copy()
    {
        return new Pattern(this.sample_idxs.slice(), this.num_steps);
    }

    // Produce a copy of this pattern with the rows that play nothing removed.
    // This is used when encoding a project: an inactive row makes no sound, but
    // still costs a sample index plus one bit per step in the URL.
    // Note that this leaves the pattern it's called on untouched.
    strip_inactive()
    {
        let row_idxs = [];

        for (let row_idx = 0; row_idx < this.num_rows; ++row_idx)
        {
            if (!this.row_is_inactive(row_idx))
                row_idxs.push(row_idx);
        }

        // A pattern always has at least one row, so an empty pattern
        // keeps its first row rather than becoming rowless
        if (row_idxs.length == 0)
            row_idxs.push(0);

        let pat = new Pattern(
            row_idxs.map(row_idx => this.sample_idxs[row_idx]),
            this.num_steps
        );
        pat.rows = row_idxs.map(row_idx => this.rows[row_idx].slice());

        return pat;
    }
}

// A project, i.e. everything that gets shared through a URL
export class Project
{
    constructor()
    {
        // A project starts out untitled, which the title field shows as a
        // placeholder rather than as text to be deleted before typing over.
        // A link made without a title is the one that says 'untitled'.
        this.title = '';

        // Tempo, in beats per minute
        this.tempo = DEFAULT_TEMPO;

        this.patterns = [Pattern.with_default_samples()];

        // Timeline lanes, one per pattern. Cell `k` of a lane covers steps
        // `[k * num_steps, (k + 1) * num_steps)` of the song, so one cell is
        // one playthrough of its pattern, and lanes of different lengths phase
        // against each other (see design.md).
        //
        // Lanes are kept here rather than on Pattern so that copying a pattern
        // doesn't copy its place in the song: a copy is a variation meant to go
        // somewhere else, so a new pattern always starts out unplaced.
        //
        // A lane never ends on an inactive cell, which is what makes the length
        // of a lane the point where it stops playing.
        this.lanes = [[]];
    }

    set_tempo(tempo)
    {
        console.assert(tempo >= MIN_TEMPO);
        console.assert(tempo <= MAX_TEMPO);
        this.tempo = tempo;
    }

    // Number of patterns this project holds
    get num_patterns()
    {
        return this.patterns.length;
    }

    // Append a pattern to the project and return its index, or null if the
    // project already holds as many patterns as it can. Patterns are always
    // added at the end, so that creating one never renumbers the patterns
    // that already exist.
    add_pattern(pattern)
    {
        if (this.num_patterns >= MAX_PATTERNS)
            return null;

        this.patterns.push(pattern);

        // A pattern starts out placed nowhere in the song
        this.lanes.push([]);

        return this.num_patterns - 1;
    }

    // Create an empty pattern, taking its samples and length from an existing
    // one, since a new pattern is usually played with the same kit
    new_pattern(src_idx)
    {
        console.assert(src_idx < this.num_patterns);
        return this.add_pattern(this.patterns[src_idx].empty_copy());
    }

    // Create a copy of an existing pattern, cells included. Most new patterns
    // in a song are variations on one that already exists.
    copy_pattern(src_idx)
    {
        console.assert(src_idx < this.num_patterns);
        return this.add_pattern(this.patterns[src_idx].copy());
    }

    // Remove a pattern from the project. Returns false if this is the last
    // pattern: a project always holds at least one.
    //
    // Patterns are referred to by index, so removing one renumbers every
    // pattern after it. This is the one place patterns are removed, so that
    // whatever holds a pattern index has a single point to be fixed up from.
    delete_pattern(pat_idx)
    {
        console.assert(pat_idx < this.num_patterns);

        if (this.num_patterns <= 1)
            return false;

        this.patterns.splice(pat_idx, 1);

        // The timeline has one lane per pattern, so the lanes are indexed the
        // same way the patterns are and shift along with them
        this.lanes.splice(pat_idx, 1);

        return true;
    }

    // Playback rate, in steps per second. Steps have a fixed duration, so this
    // is what the tempo actually controls.
    get steps_per_sec()
    {
        return this.tempo * STEPS_PER_BEAT / 60;
    }

    //========================================================================
    // Timeline
    //========================================================================

    // Test if a pattern is placed at a given cell of its lane
    get_lane_cell(pat_idx, cell_idx)
    {
        console.assert(pat_idx < this.num_patterns);

        // Cells past the end of a lane are the ones it can be extended into,
        // and hold nothing until they're turned on
        return this.lanes[pat_idx][cell_idx]? 1:0;
    }

    // Toggle a cell of a lane, returns the new value.
    //
    // Turning on a cell past the end of a lane extends the lane to reach it,
    // and turning one off trims whatever silence that leaves at the end: the
    // song ends at the last cell placed on the timeline, so a lane ending in
    // silence would make the song longer than what can be heard in it.
    toggle_lane_cell(pat_idx, cell_idx)
    {
        console.assert(pat_idx < this.num_patterns);

        let lane = this.lanes[pat_idx];
        let cell_on = !lane[cell_idx];

        // Placing a pattern past the end of the timeline is what the limit on
        // song length actually limits
        if (cell_on && (cell_idx + 1) * this.patterns[pat_idx].num_steps > MAX_SONG_STEPS)
            return false;

        while (lane.length <= cell_idx)
            lane.push(0);

        lane[cell_idx] = cell_on? 1:0;

        while (lane.length > 0 && !lane[lane.length - 1])
            lane.pop();

        return cell_on;
    }

    // Test if a pattern is playing at a given step of the song, i.e. whether
    // the cell of its lane covering that step is on
    pat_active_at(pat_idx, step_idx)
    {
        let cell_idx = Math.floor(step_idx / this.patterns[pat_idx].num_steps);
        return this.get_lane_cell(pat_idx, cell_idx);
    }

    // Length of the song, in steps, i.e. where playback loops back to the
    // start. The song has no length of its own: it ends where the last pattern
    // placed on the timeline stops playing, rounded up to a whole bar so that
    // the loop lands on a bar boundary even when the patterns don't.
    //
    // Returns 0 when no pattern is placed on the timeline, i.e. when there is
    // no song to play.
    get song_num_steps()
    {
        let song_end = 0;

        for (let pat_idx = 0; pat_idx < this.num_patterns; ++pat_idx)
        {
            // A lane never ends on an inactive cell, so its last cell stops
            // playing exactly where the lane ends
            let lane_end = this.lanes[pat_idx].length * this.patterns[pat_idx].num_steps;
            song_end = Math.max(song_end, lane_end);
        }

        let num_steps = Math.ceil(song_end / STEPS_PER_BAR) * STEPS_PER_BAR;

        // A pattern reaching the limit may have its last playthrough clipped
        // by the loop point, which is what the limit costs (see design.md)
        return Math.min(num_steps, MAX_SONG_STEPS);
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
//
// Encoding is lossy in one respect: anything that plays nothing is dropped,
// both silent rows and entirely silent patterns, so a decoded project can be
// smaller than the one that was encoded. A dropped pattern takes its timeline
// lane with it, which is what keeps lanes matched up with patterns.
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

// Size of the chunks values of no bounded size are written in, and how many
// chunks one such value can take up before it can't be anything we wrote. A
// lane holds at most MAX_SONG_STEPS cells, which is what bounds them.
const VAR_CHUNK_BITS = 4;
const MAX_VAR_CHUNKS = Math.ceil(Math.log2(MAX_SONG_STEPS + 1) / VAR_CHUNK_BITS);

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

    // Throws if the value doesn't fit the field, rather than writing it out
    // truncated. The loop below keeps only the low num_bits bits, so a value
    // that's too wide would go out as a different, perfectly valid-looking one,
    // and the link would decode into a project nobody made. A link is permanent
    // once it's been shared, so this is worth failing the encoding over.
    write(val, num_bits)
    {
        if (!Number.isInteger(val) || val < 0 || val >= 2 ** num_bits)
            throw RangeError(`cannot encode ${val} in a ${num_bits}-bit field`);

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

    // Variable-length integer encoding.
    // Write a value of no bounded size, as chunks of VAR_CHUNK_BITS bits, each
    // preceded by a bit saying whether a chunk follows. This is for the
    // timeline, where run lengths are small in a short song and large in a long
    // one, and a field wide enough for the longest song would be mostly zeroes.
    //
    // Zero is written as a single zero bit, since it takes no chunks to hold.
    // That's what makes it cheap for the timeline to write the zero that ends a
    // lane, and the zeroes that come of writing a length one lower. Every other
    // value pays one bit for it, which is a good trade only because zero is by
    // far the most common value written this way.
    //
    // Throws on a value it can't write, the way write() does. The chunks go
    // through write(), which would catch a bad value on its own, but not
    // before this has already looped on it.
    write_var(val)
    {
        if (!Number.isInteger(val) || val < 0)
            throw RangeError(`cannot encode ${val} as a variable-length value`);

        while (val > 0)
        {
            this.write(1, 1);
            this.write(val % (1 << VAR_CHUNK_BITS), VAR_CHUNK_BITS);
            val = Math.floor(val / (1 << VAR_CHUNK_BITS));
        }

        this.write(0, 1);
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

    // Read back a value written by write_var. Values are bounded by what the
    // format can hold, so a value that goes on for more chunks than that isn't
    // data we wrote.
    read_var()
    {
        let val = 0;

        for (let chunk_idx = 0; this.read(1); ++chunk_idx)
        {
            if (chunk_idx >= MAX_VAR_CHUNKS)
                throw RangeError('oversized value in encoded project data');

            val += this.read(VAR_CHUNK_BITS) * (1 << (VAR_CHUNK_BITS * chunk_idx));
        }

        return val;
    }
}

// Encode one timeline lane.
//
// Lanes are sparse: a pattern is off for most of a song, and where it's on it
// tends to be on for several cells in a row. A lane is therefore written as a
// series of blocks of consecutive active cells, each written as the gap of
// inactive cells before it followed by its own length.
//
// A block always holds at least one cell, so its length is written one lower:
// a block of a single cell then writes a zero, which costs one bit. Gaps are
// written as they are, so that an empty gap can mark the end of the lane. Only
// the gap before the first block can be empty in a lane, since two blocks with
// nothing between them would be one block.
function encode_lane(writer, lane)
{
    // A pattern not placed on the timeline is the common case, and is what the
    // lane of every pattern of a project without a song looks like
    if (lane.length == 0)
    {
        writer.write(0, 1);
        return;
    }

    writer.write(1, 1);

    for (let cell_idx = 0; cell_idx < lane.length;)
    {
        let gap_start = cell_idx;
        while (cell_idx < lane.length && !lane[cell_idx])
            ++cell_idx;

        writer.write_var(cell_idx - gap_start);

        let blk_start = cell_idx;
        while (cell_idx < lane.length && lane[cell_idx])
            ++cell_idx;

        writer.write_var(cell_idx - blk_start - 1);
    }

    // A lane never ends on an inactive cell, so a gap here can only mean the
    // lane is over
    writer.write_var(0);
}

// Read back a lane written by encode_lane.
// Cells are bounded by the length of the pattern the lane belongs to.
function decode_lane(reader, num_steps)
{
    let lane = [];

    if (!reader.read(1))
        return lane;

    for (let first_gap = true; ; first_gap = false)
    {
        let gap = reader.read_var();

        // Only the gap before the first block can be empty, so an empty gap
        // anywhere else is what ends the lane
        if (gap == 0 && !first_gap)
            return lane;

        for (let i = 0; i < gap; ++i)
            lane.push(0);

        let len = reader.read_var() + 1;

        for (let i = 0; i < len; ++i)
            lane.push(1);

        // Tested inside the loop, so that a lane claiming more blocks than the
        // song can hold is rejected rather than built up first
        if (lane.length * num_steps > MAX_SONG_STEPS)
            throw RangeError('encoded timeline lane runs past the end of the song');
    }
}

// Encode a project into a base64url string
export function encode_project(project)
{
    console.assert(project.patterns.length <= MAX_PATTERNS);

    // Patterns that play nothing are left out entirely, along with where they
    // sit on the timeline, which is what keeps lanes matched up with patterns
    let pat_idxs = [];
    for (let pat_idx = 0; pat_idx < project.num_patterns; ++pat_idx)
    {
        if (!project.patterns[pat_idx].is_inactive())
            pat_idxs.push(pat_idx);
    }

    // A project always has at least one pattern, so a project where nothing
    // plays keeps its first pattern rather than becoming patternless
    if (pat_idxs.length == 0)
        pat_idxs = [0];

    let writer = new BitWriter();

    writer.write(ENCODING_VERSION, VERSION_BITS);
    writer.write(project.tempo - MIN_TEMPO, TEMPO_BITS);
    writer.write(pat_idxs.length - 1, NUM_PATTERNS_BITS);

    for (let pat_idx of pat_idxs)
    {
        // Rows that play nothing are not worth the space they take up in a URL
        let pat = project.patterns[pat_idx].strip_inactive();

        writer.write(pat.num_steps - 1, NUM_STEPS_BITS);
        writer.write(pat.num_rows - 1, NUM_ROWS_BITS);

        for (let row_idx = 0; row_idx < pat.num_rows; ++row_idx)
        {
            writer.write(pat.sample_idxs[row_idx], SAMPLE_IDX_BITS);

            // One bit per step of this row
            for (let step_idx = 0; step_idx < pat.num_steps; ++step_idx)
                writer.write(pat.rows[row_idx][step_idx]? 1:0, 1);
        }

        // A pattern is followed by the lane placing it on the timeline
        encode_lane(writer, project.lanes[pat_idx]);
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
    project.lanes = [];

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
        project.lanes.push(decode_lane(reader, num_steps));
    }

    return project;
}

// Strip the characters that don't survive being pasted around in a URL,
// so that the title stays readable in the link
function encode_title(title)
{
    let norm = normalize_title(title);

    // A title is part of the URL, where a space can't appear as it is. Writing
    // it as an underscore keeps the title readable in the link, which
    // percent-escaping it would not.
    return norm.length? norm.replaceAll(' ', '_') : 'untitled';
}

// Undo encode_title. A title holds no underscores of its own, so every
// underscore in a link was a space.
function decode_title(title)
{
    return normalize_title(title.replaceAll('_', ' '));
}

// Reduce a title to the characters one is allowed to hold: alphanumeric words
// separated by single spaces. Everything else is dropped, which is what keeps a
// title from carrying anything but a short piece of text onto the page it's
// shown on.
//
// Length is left alone here, so that a title can be measured against both
// limits before anything has been cut off it. See title_error.
export function clean_title(title)
{
    return title.replaceAll(TITLE_STRIP_RE, '').replaceAll(/ +/g, ' ').trim();
}

// Reduce a title to what one is allowed to hold, length included. This is what
// a title read back from a link goes through: a link that's been shared has to
// keep opening, so an overlong title in one is cut down rather than refused.
export function normalize_title(title)
{
    // Cut to length last, and trimmed again in case the cut landed on a space
    return clean_title(title).substring(0, MAX_TITLE_CHARS).trim();
}

// Say why a title can't be shared, or null if it can be.
//
// This is what the title field is checked against when a link is made, rather
// than as the title is typed: a title on its way to being long enough would
// otherwise be an error the whole time it's being written.
export function title_error(title)
{
    let clean = clean_title(title);

    if (clean.length < MIN_TITLE_CHARS)
        return `A title needs at least ${MIN_TITLE_CHARS} characters.`;

    if (clean.length > MAX_TITLE_CHARS)
        return `A title can be at most ${MAX_TITLE_CHARS} characters.`;

    return null;
}

// Shortest and longest a title can be. Both are what making a link checks the
// title field against. The longest is applied again when a link is read, since
// a link can be edited by hand; the shortest is not, so that a link made before
// there was a minimum still opens with the title it was shared under.
export const MIN_TITLE_CHARS = 4;
export const MAX_TITLE_CHARS = 36;

// Characters a title can't hold. Exported so that the title field can drop
// them as they're typed, rather than only once the title is encoded.
export const TITLE_STRIP_RE = /[^A-Za-z0-9 ]+/g;

// Encode a project into a URL fragment, without the leading '#'
export function project_to_hash(project)
{
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
    project.title = decode_title(hash.substring(0, sep_idx));

    return project;
}
