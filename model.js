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

// Swing, as the percentage of a pair of steps that the first step of the pair
// takes up. 50 is an even split, i.e. no swing at all, and is where a project
// starts. 75 gives the pair the 3:1 ratio of a dotted eighth followed by a
// sixteenth, which is about as far as a groove goes before it stops reading as
// swing and starts reading as a different rhythm. Triplet swing, the setting
// most tracks that swing at all are written at, is the 67 in the middle.
export const MIN_SWING = 50;
export const MAX_SWING = 75;
export const DEFAULT_SWING = 50;

// Stereo position of a row, in tenths from hard left to hard right. Zero is
// the centre, which is where a row starts and where most of them stay: a kit
// is mixed by moving a few rows off centre, not by placing every one of them.
// Tenths are fine enough that dragging the control feels smooth and coarse
// enough to label the way a mixer does, and leave the centre a value a row can
// actually hold, which an even number of positions would not.
export const MIN_PAN = -10;
export const MAX_PAN = 10;
export const DEFAULT_PAN = 0;

// Level of a row, in decibels below the sample as it was recorded. A row
// starts at the top of the range, since balancing a kit is a matter of pulling
// things down rather than pushing them up, and the master volume is what the
// whole thing is set with.
//
// Decibels rather than a percentage because loudness is heard that way: a step
// of one is about the smallest change in level anyone can hear, so every
// setting in this range is one you can tell from its neighbours. A percentage
// spread over the same number of settings would spend most of them between 90%
// and 100%, where nobody can hear the difference, and have almost none left
// where a small change is a large one.
//
// The bottom of the range is silence rather than the -30 dB it reads as, which
// is how a fader pulled all the way down behaves, and is what mutes a row.
export const MIN_VOLUME = -30;
export const MAX_VOLUME = 0;
export const DEFAULT_VOLUME = 0;

// How much of a row is fed to the delay, in decibels, on the same scale and
// with the same bottom-is-off rule its level is on.
//
// This is a send rather than a wet/dry mix: the row itself always reaches the
// output at full level, and this says how loud a copy of it is fed to the
// delay, whose echoes are added on top. A drum is never replaced by its own
// echo, which is what a mix control at the top of its range would do, so the
// only thing worth controlling is how much echo sits behind it.
//
// A row starts with its send all the way down, so a project that was never
// given a delay sounds exactly as it did before there was one.
export const MIN_SEND = -30;
export const MAX_SEND = 0;
export const DEFAULT_SEND = MIN_SEND;

// Delay times, as fractions of a step, in increasing order.
//
// The delay is set in steps rather than in milliseconds so that it follows the
// tempo: an echo written at 120 BPM is still on the beat when the same song is
// played at 140. Steps are what this app measures time in, and a step is a
// sixteenth note, so a whole-step delay is a sixteenth, two steps an eighth,
// three the dotted eighth most delays are set to, and four a quarter note.
//
// Fractions of a step matter as much as whole ones. A step is 125ms at 120
// BPM, and the shortest delays worth having are all below that: around a
// quarter of a step doubles a hit and thickens it, a half-step is the slapback
// that sits on snares and claps, and an eighth of a step is short enough to
// read as stereo width rather than as an echo at all.
//
// The middle of the range is the finest, since that's where an echo is heard
// as a rhythm of its own. The odd ratios there are not filler: a delay set to
// five quarters or seven quarters of a step drifts against the pattern it sits
// on, the same way patterns of different lengths drift against each other.
//
// Held as numerator and denominator rather than as a number so that the
// control can name a setting the way a musician would, e.g. "3/2 steps".
export const DELAY_STEP_FRACTIONS = [
    [1, 16], [1, 8], [3, 16], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4],
    [1, 1], [5, 4], [4, 3], [3, 2], [5, 3], [7, 4],
    [2, 1], [9, 4], [7, 3], [5, 2], [8, 3],
    [3, 1], [7, 2],
    [4, 1], [9, 2], [5, 1], [16, 3],
    [6, 1], [7, 1], [8, 1], [10, 1], [12, 1], [14, 1], [16, 1],
];

// A delay time is held as an index into the table above, so this is the range
// that index runs over. The dotted eighth in the middle is where a delay is
// most often set, and is what a project starts at.
export const MIN_DELAY_TIME = 0;
export const MAX_DELAY_TIME = DELAY_STEP_FRACTIONS.length - 1;
export const DEFAULT_DELAY_TIME = DELAY_STEP_FRACTIONS.findIndex(
    ([num, den]) => num == 3 && den == 1
);

// How much of the delay's output is fed back into it, as a percentage, which
// is what decides how many times an echo repeats before it dies away.
//
// The top of the range is well short of 100, where a delay stops decaying and
// starts building on itself without bound. That is a ceiling on the range
// rather than a clamp applied later, so that no setting a project can hold or
// a link can carry is one that runs away. Steps of five, which is about the
// smallest change in the tail anyone would go looking for.
export const MIN_DELAY_FB = 0;
export const MAX_DELAY_FB = 75;
export const DELAY_FB_STEP = 5;
export const DEFAULT_DELAY_FB = 40;

// The delay time control is a slider, so the table it runs along has to be in
// increasing order: a setting further to the right that came out shorter would
// make the control run backwards over part of its travel
console.assert(
    DELAY_STEP_FRACTIONS.every(([num, den], i) =>
        i == 0 || DELAY_STEP_FRACTIONS[i - 1][0] / DELAY_STEP_FRACTIONS[i - 1][1] < num / den
    ),
    'DELAY_STEP_FRACTIONS is expected to be in increasing order'
);

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

        // Stereo position of each row. Panning is a property of the row rather
        // than of the sample, so the same sample can sit in two places in two
        // patterns, but it rarely does: a row keeps the position it was given
        // for the whole song, which is what the encoding is built to expect.
        this.pans = sample_idxs.map(() => DEFAULT_PAN);

        // Level of each row, which belongs to a row the same way its panning
        // does and is kept the same way
        this.volumes = sample_idxs.map(() => DEFAULT_VOLUME);

        // How much of each row is fed to the delay, kept the same way again
        this.sends = sample_idxs.map(() => DEFAULT_SEND);
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
        this.pans.push(DEFAULT_PAN);
        this.volumes.push(DEFAULT_VOLUME);
        this.sends.push(DEFAULT_SEND);

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

    // Set the stereo position of a given row
    set_row_pan(row_idx, pan)
    {
        console.assert(row_idx < this.num_rows);
        console.assert(pan >= MIN_PAN);
        console.assert(pan <= MAX_PAN);
        this.pans[row_idx] = pan;
    }

    // Set the level of a given row, in decibels
    set_row_volume(row_idx, volume)
    {
        console.assert(row_idx < this.num_rows);
        console.assert(volume >= MIN_VOLUME);
        console.assert(volume <= MAX_VOLUME);
        this.volumes[row_idx] = volume;
    }

    // Set how much of a given row is fed to the delay, in decibels
    set_row_send(row_idx, send)
    {
        console.assert(row_idx < this.num_rows);
        console.assert(send >= MIN_SEND);
        console.assert(send <= MAX_SEND);
        this.sends[row_idx] = send;
    }

    // Stereo position of a given row on the -1 to 1 scale the audio graph pans
    // on, rather than the tenths the model and the URL hold it in. Playback
    // asks a pattern for this so that audio.js doesn't have to import the
    // model to know what a pan value means, which would make the two circular.
    row_stereo_pan(row_idx)
    {
        return this.pans[row_idx] / MAX_PAN;
    }

    // Level of a given row as the gain the audio graph multiplies by, rather
    // than the decibels the model and the URL hold it in. Asked of a pattern
    // for the same reason row_stereo_pan is.
    //
    // A row at the bottom of the range is silent rather than very quiet, so
    // that pulling one all the way down takes it out of the song.
    row_gain(row_idx)
    {
        let volume = this.volumes[row_idx];

        return volume <= MIN_VOLUME? 0 : 10 ** (volume / 20);
    }

    // How much of a given row is fed to the delay, as the gain the audio graph
    // multiplies the copy it sends there by, rather than the decibels the model
    // holds. Asked of a pattern for the same reason the two above are.
    //
    // A row at the bottom of the range feeds the delay nothing rather than
    // very little, so a row nobody sent anywhere costs no nodes to play.
    row_send_gain(row_idx)
    {
        let send = this.sends[row_idx];

        return send <= MIN_SEND? 0 : 10 ** (send / 20);
    }

    // Remove a row from the pattern.
    // Returns false if the pattern is down to the last row it has to keep.
    delete_row(row_idx)
    {
        console.assert(row_idx < this.num_rows);

        if (this.num_rows <= MIN_PAT_ROWS)
            return false;

        this.sample_idxs.splice(row_idx, 1);
        this.rows.splice(row_idx, 1);
        this.pans.splice(row_idx, 1);
        this.volumes.splice(row_idx, 1);
        this.sends.splice(row_idx, 1);

        return true;
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
        pat.pans = this.pans.slice();
        pat.volumes = this.volumes.slice();
        pat.sends = this.sends.slice();

        return pat;
    }

    // Produce an empty pattern with the same samples and length as this one.
    // A newly created pattern is made this way rather than from the default
    // samples: samples live on pattern rows, so starting from the defaults
    // would throw away whatever kit the user has assembled.
    empty_copy()
    {
        let pat = new Pattern(this.sample_idxs.slice(), this.num_steps);

        // Panning, level and delay send are part of the kit for the same reason
        // the samples are, so a new pattern keeps how the rows were set rather
        // than pulling everything back to the middle and back up to full
        pat.pans = this.pans.slice();
        pat.volumes = this.volumes.slice();
        pat.sends = this.sends.slice();

        return pat;
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
        pat.pans = row_idxs.map(row_idx => this.pans[row_idx]);
        pat.volumes = row_idxs.map(row_idx => this.volumes[row_idx]);
        pat.sends = row_idxs.map(row_idx => this.sends[row_idx]);

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

        // Swing, as a percentage (see above). Swing belongs to the project
        // rather than to a pattern: steps have a fixed duration and patterns of
        // different lengths phase against each other, so an off-beat step is an
        // off-beat of the song's step grid rather than of whichever pattern
        // happens to be playing across it.
        this.swing = DEFAULT_SWING;

        // Delay time, as an index into DELAY_STEP_FRACTIONS, and how much of
        // the delay is fed back into itself, as a percentage.
        //
        // There is one delay for the whole project, which every row feeds
        // through its own send, the way a mixer has one effect on a bus rather
        // than one per channel. Two rows echoing at different times is not what
        // a delay is for, and a project's worth of them is a project's worth of
        // delay lines to run.
        //
        // It belongs to the project rather than to a pattern for the reason
        // swing does: the delay is set in steps, and the step grid is the
        // song's rather than any one pattern's.
        this.delay_time = DEFAULT_DELAY_TIME;
        this.delay_feedback = DEFAULT_DELAY_FB;

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

    set_swing(swing)
    {
        console.assert(swing >= MIN_SWING);
        console.assert(swing <= MAX_SWING);
        this.swing = swing;
    }

    // Set the delay time, as an index into DELAY_STEP_FRACTIONS
    set_delay_time(delay_time)
    {
        console.assert(delay_time >= MIN_DELAY_TIME);
        console.assert(delay_time <= MAX_DELAY_TIME);
        this.delay_time = delay_time;
    }

    // Set the delay feedback, as a percentage. Only the settings the control
    // stops at can be encoded, so a value between two of them is caught here
    // rather than when a link is made.
    set_delay_feedback(delay_feedback)
    {
        console.assert(delay_feedback >= MIN_DELAY_FB);
        console.assert(delay_feedback <= MAX_DELAY_FB);
        console.assert(delay_feedback % DELAY_FB_STEP == 0);
        this.delay_feedback = delay_feedback;
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

    // How far a swung step is pushed back, as a fraction of a step.
    //
    // A pair of steps covers two steps either way, so a first step taking up
    // `swing` percent of the pair runs 2 * swing / 100 steps long, and the
    // second step of the pair starts wherever the first one ends. The delay is
    // how far past its own place on the grid that puts it: none at 50, and half
    // a step at 75, which is where the pair lands on a 3:1 ratio.
    get swing_delay()
    {
        return 2 * this.swing / 100 - 1;
    }

    // How long the delay holds a sound for, in seconds. The delay is set in
    // steps, so this follows the tempo: the echoes of a song played faster
    // come closer together rather than falling off the grid.
    //
    // Swing is deliberately not accounted for. It moves when a step is heard
    // without moving the grid the steps are counted on, and the delay is set
    // against that grid, which is what a delay synced to a drum machine's
    // clock does. Echoes therefore land on the straight positions of the grid
    // even while the pattern above them swings.
    get delay_time_secs()
    {
        let [num, den] = DELAY_STEP_FRACTIONS[this.delay_time];

        return (num / den) / this.steps_per_sec;
    }

    // Delay feedback as the gain the audio graph multiplies by, rather than
    // the percentage the model and the URL hold it in
    get delay_feedback_gain()
    {
        return this.delay_feedback / 100;
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
// the project, and the version field makes it possible to change the format
// without breaking already-shared links.
//
// What a link mostly holds is pattern rows, so that is where the compression
// is. Everything about a row but its cells is written as a guess, costing a
// single bit when the guess is right: the sample it plays, where it sits in
// the stereo field, how loud it is and how much of it goes to the delay. Its
// cells go in whichever of four schemes writes them in the fewest bits (see
// encode_row_cells). Rows repeat both across a song and within one, and these
// are what that repetition is worth.
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
const SWING_BITS = 5;
const NUM_PATTERNS_BITS = 6;
const NUM_STEPS_BITS = 6;
const NUM_ROWS_BITS = 4;
const SAMPLE_IDX_BITS = 9;
const PAN_BITS = 5;
const VOLUME_BITS = 5;
const SEND_BITS = 5;
const DELAY_TIME_BITS = 5;
const DELAY_FB_BITS = 4;

// How the cells of a row are written. Every row says which of these it used,
// and the encoder takes whichever writes that row in the fewest bits, so a row
// with no structure to it costs the two bits of this field and nothing else.
const GRID_SCHEME_BITS = 2;
const GRID_LITERAL = 0;     // One bit per step, as-is
const GRID_MOTIF = 1;       // A short cell repeated the length of the row
const GRID_GROUP_8 = 2;     // Groups of 8 steps, each either new or a repeat
const GRID_GROUP_16 = 3;    // The same, in groups of 16

// Lengths the repeated cell of a motif row can have. Drum rows repeat at these
// intervals and not at the ones between them, so two bits cover it: a quarter
// note pulse is 4, a half bar is 8, a bar is 16.
const MOTIF_PERIOD_BITS = 2;
const MOTIF_PERIODS = [2, 4, 8, 16];

// Step counts the group schemes above work in. Eight steps is half a bar,
// which is the interval a row most often repeats at while still varying
// somewhere, and sixteen is the bar it sits in.
const GROUP_SIZES = { [GRID_GROUP_8]: 8, [GRID_GROUP_16]: 16 };

// Size of the chunks values of no bounded size are written in, and how many
// chunks one such value can take up before it can't be anything we wrote. A
// lane holds at most MAX_SONG_STEPS cells, which is what bounds them.
//
// Three bits is what the corpus wants. The values written this way are gaps
// and block lengths on the timeline, and those cluster small: a song is laid
// out in a handful of blocks a few cells long. Chunks of three bits write
// everything up to 7 in one chunk and pay a bit less for the values above it
// than four-bit chunks save on the ones below. Two bits is worse again, since
// a long song's gaps then take chunks enough for the extra continuation bits
// to outweigh what they save.
const VAR_CHUNK_BITS = 3;
const MAX_VAR_CHUNKS = Math.ceil(Math.log2(MAX_SONG_STEPS + 1) / VAR_CHUNK_BITS);

console.assert(MAX_TEMPO - MIN_TEMPO < (1 << TEMPO_BITS));
console.assert(MAX_SWING - MIN_SWING < (1 << SWING_BITS));
console.assert(MAX_PAN - MIN_PAN < (1 << PAN_BITS));
console.assert(MAX_VOLUME - MIN_VOLUME < (1 << VOLUME_BITS));
console.assert(MAX_SEND - MIN_SEND < (1 << SEND_BITS));
console.assert(DELAY_STEP_FRACTIONS.length == (1 << DELAY_TIME_BITS));
console.assert(MAX_DELAY_FB / DELAY_FB_STEP < (1 << DELAY_FB_BITS));
console.assert(MAX_PATTERNS <= (1 << NUM_PATTERNS_BITS));
console.assert(MAX_PAT_STEPS <= (1 << NUM_STEPS_BITS));
console.assert(MAX_PAT_ROWS <= (1 << NUM_ROWS_BITS));
console.assert(MOTIF_PERIODS.length == (1 << MOTIF_PERIOD_BITS));

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

// Length of the cell a row repeats, or 0 if it doesn't repeat. This is the
// shortest cell that works, which is also the cheapest one to write.
//
// The cell doesn't have to divide the row: it is laid down from the start of
// the row and cut off wherever the row ends, so a 4 step cell also writes a 6
// step row holding those four steps followed by the first two of them again.
function motif_period(row, num_steps)
{
    for (let period of MOTIF_PERIODS)
    {
        // The periods are in ascending order, so once one is as long as the
        // row every one after it is too
        if (period >= num_steps)
            break;

        let tiles = true;

        for (let step_idx = period; step_idx < num_steps; ++step_idx)
        {
            if (!row[step_idx] != !row[step_idx % period])
            {
                tiles = false;
                break;
            }
        }

        if (tiles)
            return period;
    }

    return 0;
}

// Test if the group of steps starting at a given step is the same as the group
// before it. The last group of a row can be shorter than the others, in which
// case only the steps it holds are compared.
function group_repeats(row, num_steps, start, size)
{
    for (let step_idx = start; step_idx < Math.min(start + size, num_steps); ++step_idx)
    {
        if (!row[step_idx] != !row[step_idx - size])
            return false;
    }

    return true;
}

// Number of bits the group scheme of a given size writes a row in, i.e. one
// group as-is followed by one bit per group after it, plus the groups that
// bit couldn't stand in for
function group_cost(row, num_steps, size)
{
    let num_bits = Math.min(size, num_steps);

    for (let start = size; start < num_steps; start += size)
    {
        num_bits += 1;

        if (!group_repeats(row, num_steps, start, size))
            num_bits += Math.min(size, num_steps - start);
    }

    return num_bits;
}

// Write the cells of one row, in whichever scheme writes it in the fewest
// bits. A row with no repetition in it falls to GRID_LITERAL, so the choice
// costs GRID_SCHEME_BITS and can never make a row longer than writing it flat.
function encode_row_cells(writer, row, num_steps)
{
    function write_steps(from, to)
    {
        for (let step_idx = from; step_idx < to; ++step_idx)
            writer.write(row[step_idx]? 1:0, 1);
    }

    let period = motif_period(row, num_steps);

    let costs = {
        [GRID_LITERAL]: num_steps,
        [GRID_MOTIF]: period? MOTIF_PERIOD_BITS + period : Infinity,
        [GRID_GROUP_8]: group_cost(row, num_steps, GROUP_SIZES[GRID_GROUP_8]),
        [GRID_GROUP_16]: group_cost(row, num_steps, GROUP_SIZES[GRID_GROUP_16]),
    };

    // Ties go to the plainest scheme that holds the row, so that a row with
    // nothing to compress about it always writes the same way
    let scheme = GRID_LITERAL;
    for (let candidate of [GRID_MOTIF, GRID_GROUP_8, GRID_GROUP_16])
    {
        if (costs[candidate] < costs[scheme])
            scheme = candidate;
    }

    writer.write(scheme, GRID_SCHEME_BITS);

    if (scheme == GRID_LITERAL)
    {
        write_steps(0, num_steps);
        return;
    }

    if (scheme == GRID_MOTIF)
    {
        writer.write(MOTIF_PERIODS.indexOf(period), MOTIF_PERIOD_BITS);
        write_steps(0, period);
        return;
    }

    let size = GROUP_SIZES[scheme];
    write_steps(0, Math.min(size, num_steps));

    for (let start = size; start < num_steps; start += size)
    {
        let repeats = group_repeats(row, num_steps, start, size);
        writer.write(repeats? 1:0, 1);

        if (!repeats)
            write_steps(start, Math.min(start + size, num_steps));
    }
}

// Read back the cells of one row written by encode_row_cells
function decode_row_cells(reader, num_steps)
{
    let scheme = reader.read(GRID_SCHEME_BITS);
    let row = Array(num_steps).fill(0);

    if (scheme == GRID_LITERAL)
    {
        for (let step_idx = 0; step_idx < num_steps; ++step_idx)
            row[step_idx] = reader.read(1);

        return row;
    }

    if (scheme == GRID_MOTIF)
    {
        let period = MOTIF_PERIODS[reader.read(MOTIF_PERIOD_BITS)];

        // A cell as long as the row is one the encoder would have written flat,
        // and a longer one holds steps the row doesn't have
        if (period >= num_steps)
            throw RangeError('encoded row repeats a cell as long as itself');

        let motif = [];
        for (let step_idx = 0; step_idx < period; ++step_idx)
            motif.push(reader.read(1));

        for (let step_idx = 0; step_idx < num_steps; ++step_idx)
            row[step_idx] = motif[step_idx % period];

        return row;
    }

    let size = GROUP_SIZES[scheme];

    for (let step_idx = 0; step_idx < Math.min(size, num_steps); ++step_idx)
        row[step_idx] = reader.read(1);

    for (let start = size; start < num_steps; start += size)
    {
        let repeats = reader.read(1);

        for (let step_idx = start; step_idx < Math.min(start + size, num_steps); ++step_idx)
            row[step_idx] = repeats? row[step_idx - size] : reader.read(1);
    }

    return row;
}

// What the encoding expects a row's sample to be, which is what it costs a
// single bit to say. Patterns are made by copying one another, so a row nearly
// always plays what the row at the same index of the previous pattern plays,
// and the rows of the first pattern nearly always play the samples they were
// handed when the pattern was created.
function predicted_sample(prev_pat, row_idx)
{
    if (prev_pat && row_idx < prev_pat.num_rows)
        return prev_pat.sample_idxs[row_idx];

    return get_sample_idx(ROW_SAMPLES[row_idx]);
}

// Likewise for where a row sits in the stereo field. Panning belongs to the
// kit rather than to a pattern, so a row panned in one pattern is panned the
// same way in the next, and a row nobody moved is in the centre.
function predicted_pan(prev_pat, row_idx)
{
    if (prev_pat && row_idx < prev_pat.num_rows)
        return prev_pat.pans[row_idx];

    return DEFAULT_PAN;
}

// And likewise for its level, which is kept the same way panning is: a row
// turned down in one pattern is turned down in the next, and a row nobody
// touched is still at the top of the range.
function predicted_volume(prev_pat, row_idx)
{
    if (prev_pat && row_idx < prev_pat.num_rows)
        return prev_pat.volumes[row_idx];

    return DEFAULT_VOLUME;
}

// And likewise for how much of it goes to the delay. A row sent to the delay
// in one pattern is sent there in the next, since what gets an echo is a part
// of the kit rather than of the pattern, and a row nobody sent anywhere is
// still dry.
function predicted_send(prev_pat, row_idx)
{
    if (prev_pat && row_idx < prev_pat.num_rows)
        return prev_pat.sends[row_idx];

    return DEFAULT_SEND;
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
    writer.write(project.swing - MIN_SWING, SWING_BITS);

    // How the delay is set, which costs a single bit in a project that left it
    // where it started. Most projects do: a row has to be sent to the delay
    // before any of this is audible at all, so the settings are only worth
    // writing out for a project that went looking for them.
    let delay_default = project.delay_time == DEFAULT_DELAY_TIME &&
                        project.delay_feedback == DEFAULT_DELAY_FB;

    writer.write(delay_default? 1:0, 1);

    if (!delay_default)
    {
        writer.write(project.delay_time, DELAY_TIME_BITS);
        writer.write(project.delay_feedback / DELAY_FB_STEP, DELAY_FB_BITS);
    }

    writer.write(pat_idxs.length - 1, NUM_PATTERNS_BITS);

    // The pattern written before the one being written, which is what the
    // samples and the panning of a row are guessed from. This is the previous
    // pattern as it went into the link, stripped and with the silent patterns
    // left out, so that the decoder can arrive at the same guess.
    let prev_pat = null;

    for (let pat_idx of pat_idxs)
    {
        // Rows that play nothing are not worth the space they take up in a URL
        let pat = project.patterns[pat_idx].strip_inactive();

        writer.write(pat.num_steps - 1, NUM_STEPS_BITS);
        writer.write(pat.num_rows - 1, NUM_ROWS_BITS);

        // A row's fields are written in the order the editor lays them out in,
        // left to right: the sample it plays, its cells, where it sits in the
        // stereo field, how loud it is, and how much of it goes to the delay.
        // Nothing forces that, and the encoding would be no shorter either way,
        // but a control added to one and not the other is what makes these two
        // stop reading as the same thing. Anything added here belongs at the
        // end of a row on screen.
        for (let row_idx = 0; row_idx < pat.num_rows; ++row_idx)
        {
            let sample_idx = pat.sample_idxs[row_idx];
            let is_predicted = sample_idx == predicted_sample(prev_pat, row_idx);

            writer.write(is_predicted? 1:0, 1);

            if (!is_predicted)
                writer.write(sample_idx, SAMPLE_IDX_BITS);

            encode_row_cells(writer, pat.rows[row_idx], pat.num_steps);

            let pan = pat.pans[row_idx];
            let pan_predicted = pan == predicted_pan(prev_pat, row_idx);

            writer.write(pan_predicted? 1:0, 1);

            if (!pan_predicted)
                writer.write(pan - MIN_PAN, PAN_BITS);

            let volume = pat.volumes[row_idx];
            let vol_predicted = volume == predicted_volume(prev_pat, row_idx);

            writer.write(vol_predicted? 1:0, 1);

            if (!vol_predicted)
                writer.write(volume - MIN_VOLUME, VOLUME_BITS);

            let send = pat.sends[row_idx];
            let send_predicted = send == predicted_send(prev_pat, row_idx);

            writer.write(send_predicted? 1:0, 1);

            if (!send_predicted)
                writer.write(send - MIN_SEND, SEND_BITS);
        }

        // A pattern is followed by the lane placing it on the timeline
        encode_lane(writer, project.lanes[pat_idx]);

        prev_pat = pat;
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
    project.set_swing(MIN_SWING + reader.read(SWING_BITS));

    // A project that left the delay where it started says so in one bit, and
    // is already holding the settings it would have written
    if (!reader.read(1))
    {
        project.set_delay_time(reader.read(DELAY_TIME_BITS));
        project.set_delay_feedback(reader.read(DELAY_FB_BITS) * DELAY_FB_STEP);
    }

    let num_patterns = reader.read(NUM_PATTERNS_BITS) + 1;
    project.patterns = [];
    project.lanes = [];

    // The pattern read before this one, which its rows are guessed from the
    // same way the encoder guessed them (see predicted_sample)
    let prev_pat = null;

    for (let pat_idx = 0; pat_idx < num_patterns; ++pat_idx)
    {
        let num_steps = reader.read(NUM_STEPS_BITS) + 1;
        let num_rows = reader.read(NUM_ROWS_BITS) + 1;

        let sample_idxs = [];
        let rows = [];
        let pans = [];
        let volumes = [];
        let sends = [];

        for (let row_idx = 0; row_idx < num_rows; ++row_idx)
        {
            // An index with no sample behind it is not an error: indices are
            // reserved permanently, so a project shared before a sample was
            // removed must still load, minus the row that used it
            sample_idxs.push(reader.read(1)?
                predicted_sample(prev_pat, row_idx) :
                reader.read(SAMPLE_IDX_BITS));

            rows.push(decode_row_cells(reader, num_steps));

            pans.push(reader.read(1)?
                predicted_pan(prev_pat, row_idx) :
                MIN_PAN + reader.read(PAN_BITS));

            volumes.push(reader.read(1)?
                predicted_volume(prev_pat, row_idx) :
                MIN_VOLUME + reader.read(VOLUME_BITS));

            sends.push(reader.read(1)?
                predicted_send(prev_pat, row_idx) :
                MIN_SEND + reader.read(SEND_BITS));
        }

        let pat = new Pattern(sample_idxs, num_steps);
        pat.rows = rows;

        // Set through the model rather than assigned, so that a field holding
        // one of the values the encoder never writes is caught here rather than
        // reaching the audio graph
        for (let row_idx = 0; row_idx < num_rows; ++row_idx)
        {
            pat.set_row_pan(row_idx, pans[row_idx]);
            pat.set_row_volume(row_idx, volumes[row_idx]);
            pat.set_row_send(row_idx, sends[row_idx]);
        }

        project.patterns.push(pat);
        project.lanes.push(decode_lane(reader, num_steps));

        prev_pat = pat;
    }

    return project;
}

// Write a title into the form it takes in a link, i.e. stripped of the
// characters that don't survive being pasted around in a URL
export function encode_title(title)
{
    let norm = normalize_title(title);

    // A title is part of the URL, where a space can't appear as it is. Writing
    // it as an underscore keeps the title readable in the link, which
    // percent-escaping it would not.
    return norm.length? norm.replaceAll(' ', '_') : 'untitled';
}

// Undo encode_title. A title holds no underscores of its own, so every
// underscore in a link was a space.
export function decode_title(title)
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
//
// This is a step on the way to a link rather than something to reach for from
// outside: what a title comes to is encode_title's business, and what a link
// says a title is is decode_title's.
function normalize_title(title)
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
        return `Project title needs at least ${MIN_TITLE_CHARS} characters.`;

    if (!TITLE_START_RE.test(clean))
        return 'Project title has to start with a letter or a number.';

    if (clean.length > MAX_TITLE_CHARS)
        return `Project title can be at most ${MAX_TITLE_CHARS} characters.`;

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
//
// This is an allowlist rather than a list of what to reject, so that what a
// title can carry onto the page stays true by construction rather than by
// review. Everything here survives in a URL fragment as it is: browsers only
// escape spaces, quotes, angle brackets and backticks there.
//
// What's deliberately left out, beyond the obvious:
//   _ * ~ ( )  are what Markdown gives meaning to, and a link posted anywhere
//              Markdown is rendered has to come out the other side whole. The
//              underscore is doubly spoken for, being how a space is written.
//   &          would let a title ending in an entity name swallow the ';' that
//              follows it: 'tom&copy' + ';' reads as '&copy;' to anything that
//              decodes HTML, and the link loses its separator.
//   # %        are not a fragment's to hold. A second '#' is outside the URL
//              grammar, and a bare '%' is an incomplete escape.
//   ;          separates the title from the data, so a title can't hold one.
export const TITLE_STRIP_RE = /[^A-Za-z0-9 !$'+,.\/:=?@-]/g;

// A title has to open on a letter or a number. Punctuation is there to be used
// inside a title rather than to lead one, and a title that opens on it reads as
// something other than a name for a track. Numbers are as good an opener as
// letters: plenty of tracks are named 808 State or 4 Hero.
const TITLE_START_RE = /^[A-Za-z0-9]/;

// What separates the title from the project data in a fragment. A title can
// hold a comma now, so the separator has to be something a title can't hold.
// The encoded data is base64url, which is alphanumeric plus '-' and '_', so
// this can't turn up on that side either.
const TITLE_SEP = ';';

// Encode a project into a URL fragment, without the leading '#'
export function project_to_hash(project)
{
    return `${encode_title(project.title)}${TITLE_SEP}${encode_project(project)}`;
}

// Decode a project from a URL fragment, with or without the leading '#'.
// Throws if the fragment is not a valid encoded project.
export function project_from_hash(hash)
{
    if (hash.startsWith('#'))
        hash = hash.substring(1);

    let sep_idx = hash.indexOf(TITLE_SEP);
    if (sep_idx == -1)
        throw SyntaxError('missing separator between title and project data');

    let project = decode_project(hash.substring(sep_idx + 1));
    project.title = decode_title(hash.substring(0, sep_idx));

    return project;
}
