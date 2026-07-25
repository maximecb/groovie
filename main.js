import { SAMPLE_MAP } from "./sample_list.js";
console.assert(Object.keys(SAMPLE_MAP).length > 0);

class SampleManager
{
    constructor()
    {
        // SAMPLE_MAP maps sample paths to indices. Sample indices are stable
        // over time (see update_samples.py), so a path may be missing from
        // disk while its index stays reserved. We index paths by their fixed
        // index rather than by position, leaving holes for any such gaps.
        this.names_to_idxs = new Map();
        this.paths_by_idx = [];
        for (let [sample_path, sample_idx] of Object.entries(SAMPLE_MAP))
        {
            let sample_name = sample_path.match(/samples\/(.+)\.wav/)[1];
            console.assert(typeof sample_name == 'string');
            this.names_to_idxs.set(sample_name, sample_idx);
            this.paths_by_idx[sample_idx] = sample_path;
        }

        // Number of sample slots (highest index + 1)
        this.num_samples = this.paths_by_idx.length;

        // Audio buffers for the samples
        this.sample_bufs = Array(this.num_samples);
    }

    // Fetch/download a sample by index
    // Note that this only requests to load the sample asynchronously.
    // This function doesn't return anything
    fetch_sample(sample_idx)
    {
        console.assert(sample_idx < this.num_samples);

        // Check if sample already loaded
        if (this.sample_bufs[sample_idx])
            return;

        let sample_path = this.paths_by_idx[sample_idx];

        // The index may be reserved for a sample no longer on disk
        if (!sample_path)
            return;

        console.log(`Fetching ${sample_path}`);

        fetch(sample_path)
        .then(response => response.arrayBuffer())
        .then(array_buffer => audio_ctx.decodeAudioData(array_buffer))
        .then(audio_buffer => this.sample_bufs[sample_idx] = audio_buffer)
        .catch(err => console.error(err));

        //
        // TODO: on failure, retry once or twice after a small delay?
        // function retry(num_tries)
        //
    }

    // Get the audio buffer for a sample
    get_buffer(sample_idx)
    {
        console.assert(typeof sample_idx == 'number');
        console.assert(sample_idx < this.num_samples);

        // This will return undefined if the sample is not yet loaded
        return this.sample_bufs[sample_idx];
    }

    // Get the index for a given sample name
    get_idx(sample_name)
    {
        console.assert(this.names_to_idxs.has(sample_name));
        return this.names_to_idxs.get(sample_name);
    }

    // Play a sample at a given time relative to the audio context clock
    play_sample(sample_idx, start_time, dst_node)
    {
        const buffer = this.get_buffer(sample_idx);

        // If the sample is not yet loaded, do nothing
        if (!buffer)
            return;

        // Create a buffer source
        const source = audio_ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(dst_node);

        // Start playback at the specified time on the audio context clock
        source.start(start_time);
    }
}

// Minimum and maximum pattern length, in steps
const MIN_PAT_STEPS = 1;
const MAX_PAT_STEPS = 64;

class Pattern
{
    constructor()
    {
        // Pattern length, in steps. Steps have a fixed duration, so a shorter
        // pattern is shorter in time, not slower. Patterns of different lengths
        // phase against each other (see design.md).
        this.num_steps = 16;

        // Sample associated with each row. A pattern has one row per sample,
        // and the number of rows is variable.
        this.sample_idxs = [
            samples.get_idx('kick_01'),
            samples.get_idx('snare_01'),
            samples.get_idx('hat_closed_01'),
            samples.get_idx('hat_open_01'),
            samples.get_idx('clap_01'),
        ];

        // Fetch the samples for this pattern
        for (let sample_idx of this.sample_idxs)
        {
            samples.fetch_sample(sample_idx);
        }

        // Initialize grid cells, one row of steps per sample
        this.rows = this.sample_idxs.map(() => Array(this.num_steps).fill(0));
    }

    // Number of rows in this pattern, i.e. the number of samples it plays
    get num_rows()
    {
        return this.sample_idxs.length;
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

    // Generate HTML DOM nodes for the pattern grid
    gen_grid(pat_div)
    {
        // Create a div representing one cell
        let make_cell = (row_idx, step_idx) =>
        {
            // The outer cell div is the element reacting to clicks
            // It's larger and therefore easier to click
            let cell = document.createElement('div');
            cell.className = 'cell_box';

            // The inner div is the colored/highlighted element
            let inner = document.createElement('div');
            let cell_on = this.rows[row_idx][step_idx];
            inner.className = cell_on? 'cell on':'cell off';
            cell.appendChild(inner);

            cell.onclick = (evt) =>
            {
                let cell_on = !this.rows[row_idx][step_idx];
                this.rows[row_idx][step_idx] = cell_on;
                inner.className = cell_on? 'cell on':'cell off';

                evt.stopPropagation();
            };

            return cell;
        };

        // One row of cells per sample
        for (let row_idx = 0; row_idx < this.num_rows; ++row_idx)
        {
            let row_div = document.createElement('div');
            row_div.className = 'pat_row';

            for (let step_idx = 0; step_idx < this.num_steps; ++step_idx)
            {
                row_div.appendChild(make_cell(row_idx, step_idx));
            }

            pat_div.appendChild(row_div);
        }
    }
}

// Create AudioContext with 44.1kHz sample rate
const audio_ctx = new AudioContext({
    sampleRate: 44100,
});

// Global volume/gain node
let global_gain = null;

const samples = new SampleManager();

// Play pattern button
const play_pat = document.getElementById('play_pat');

// Tempo slider
const tempo_slider = document.getElementById('tempo_slider');
const tempo_val = document.getElementById('tempo_val');

// Volume slider
const volume_slider = document.getElementById('volume_slider');
const volume_val = document.getElementById('volume_val');

// Pattern length selector
const num_steps_sel = document.getElementById('num_steps');

// Pattern editor div
const pat_div = document.getElementById('pat_div');

// Tempo in beats per minute
let tempo = tempo_slider.valueAsNumber;

// List of patterns
let patterns = Array(8);

// Create a first pattern
patterns[0] = new Pattern();

// Currently selected pattern
let cur_pat = 0;

// Interval to update the audio playback
let update_interv = null;

// Regenerate the DOM for the currently selected pattern
function render_pattern()
{
    pat_div.replaceChildren();
    patterns[cur_pat].gen_grid(pat_div);
}

render_pattern();

// Initialize the web audio context
async function init_web_audio()
{
    // If already initialized, stop
    if (global_gain)
        return;

    console.log('Initializing web audio');

    // Global volume node
    let gain_val = volume_slider.valueAsNumber / 100;
    global_gain = audio_ctx.createGain();
    global_gain.gain.setValueAtTime(gain_val, audio_ctx.currentTime);
    global_gain.connect(audio_ctx.destination);

    // The audio context starts out in a paused state
    await audio_ctx.resume();
}

tempo_slider.oninput = function ()
{
    tempo = tempo_slider.valueAsNumber;
    tempo_val.textContent = tempo;
}

volume_slider.oninput = function ()
{
    let gain_val = volume_slider.valueAsNumber / 100;
    volume_val.textContent = volume_slider.valueAsNumber;

    // The gain node only exists once the audio context is initialized
    if (global_gain)
        global_gain.gain.setValueAtTime(gain_val, audio_ctx.currentTime);
}

num_steps_sel.onchange = function ()
{
    patterns[cur_pat].set_num_steps(Number(num_steps_sel.value));
    render_pattern();
}

play_pat.onclick = async function ()
{
    // If already playing, stop playback
    if (update_interv)
    {
        console.log('Stopping playback');
        clearInterval(update_interv);
        update_interv = null;
        return;
    }

    console.log('Starting pattern playback');

    await init_web_audio();

    // Reset the playback position. The audio clock has been running ever since
    // the audio context was created, so we anchor the position to the current
    // time, otherwise the first update would try to queue every step elapsed
    // since page load.
    last_time = audio_ctx.currentTime;
    last_pos = 0;
    next_step = 0;

    // Queue the first steps immediately, so that playback starts without
    // waiting for the first interval to elapse
    update_playback();

    // Schedule update callback
    update_interv = setInterval(update_playback, UPDATE_INTERV_MS);
}


// How far ahead of the audio clock we queue samples, in seconds
const LOOKAHEAD_TIME = 0.1;

// How often the playback update runs, in milliseconds
const UPDATE_INTERV_MS = 1000 / 25;

// Audio context time at the last playback update
let last_time = 0;

// Playback position we last queued until
// Monotonically increasing position in fractional steps
let last_pos = 0;

// Index of the next step to be queued. Steps have a fixed duration, so this is
// a single global step counter shared by every pattern: a pattern just plays
// step `next_step % pat.num_steps`. That's what makes patterns of different
// lengths phase against each other, and it means we don't need to keep a
// playback position per pattern.
let next_step = 0;

// Update playback
function update_playback()
{
    // Compute the step rate from the tempo in beats per minute.
    // A beat is 4 steps, so at 120 BPM there are 8 steps per second.
    let steps_per_sec = tempo * 4 / 60;

    // Time to queue until
    let queue_until_t = audio_ctx.currentTime + LOOKAHEAD_TIME;

    // Advance the position by however much time elapsed since the last update.
    // We accumulate a delta instead of computing the position directly from the
    // audio clock so that moving the tempo slider mid-playback only affects the
    // steps queued from here on, instead of retroactively rescaling the position
    // of everything already played, which would make the playback jump.
    let delta_time = queue_until_t - last_time;
    let delta_steps = delta_time * steps_per_sec;
    let queue_until_pos = last_pos + delta_steps;

    // TODO: for now we only play the currently selected pattern,
    // song playback will need to scan every pattern active on the timeline
    let pat = patterns[cur_pat];

    // For each step falling inside the lookahead window
    for (; next_step <= queue_until_pos; ++next_step)
    {
        // Back-project the time of this step from the queue horizon
        let step_time = queue_until_t - (queue_until_pos - next_step) / steps_per_sec;

        let step_idx = next_step % pat.num_steps;

        // Trigger the sample of each active cell on this step.
        // There is one row per sample, and the number of rows is variable.
        for (let row_idx = 0; row_idx < pat.num_rows; ++row_idx)
        {
            if (pat.rows[row_idx][step_idx])
                samples.play_sample(pat.sample_idxs[row_idx], step_time, global_gain);
        }
    }

    last_time = queue_until_t;
    last_pos = queue_until_pos;
}