import { NUM_SAMPLES, get_sample_path } from "./model.js";

// Create AudioContext with 44.1kHz sample rate
export const audio_ctx = new AudioContext({
    sampleRate: 44100,
});

//============================================================================
// Sample loading and playback
//============================================================================

class SampleManager
{
    constructor()
    {
        // Audio buffers for the samples, indexed by sample index
        this.sample_bufs = Array(NUM_SAMPLES);

        // Fetches currently in flight, indexed by sample index. A buffer isn't
        // stored until it finishes decoding, so we need this to know that a
        // sample is already on its way and avoid downloading it twice.
        this.pending_fetches = Array(NUM_SAMPLES);
    }

    // Fetch/download a sample by index
    // Note that this only requests to load the sample asynchronously.
    // This function doesn't return anything
    fetch_sample(sample_idx)
    {
        console.assert(sample_idx < NUM_SAMPLES);

        // Check if the sample is already loaded, or already being loaded
        if (this.sample_bufs[sample_idx] || this.pending_fetches[sample_idx])
            return;

        let sample_path = get_sample_path(sample_idx);

        // The index may be reserved for a sample no longer on disk
        if (!sample_path)
            return;

        console.log(`Fetching ${sample_path}`);

        // Clearing the pending fetch once it settles means that a sample whose
        // fetch failed will be retried the next time it's requested
        this.pending_fetches[sample_idx] = fetch(sample_path)
        .then(response => response.arrayBuffer())
        .then(array_buffer => audio_ctx.decodeAudioData(array_buffer))
        .then(audio_buffer => this.sample_bufs[sample_idx] = audio_buffer)
        .catch(err => console.error(err))
        .finally(() => this.pending_fetches[sample_idx] = null);

        //
        // TODO: on failure, retry once or twice after a small delay?
        // function retry(num_tries)
        //
    }

    // Get the audio buffer for a sample
    get_buffer(sample_idx)
    {
        console.assert(typeof sample_idx == 'number');
        console.assert(sample_idx < NUM_SAMPLES);

        // This will return undefined if the sample is not yet loaded
        return this.sample_bufs[sample_idx];
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

const samples = new SampleManager();

// Request the samples used by a pattern
export function fetch_pattern_samples(pattern)
{
    for (let sample_idx of pattern.sample_idxs)
        samples.fetch_sample(sample_idx);
}

// Request the samples used by every pattern of a project
export function fetch_project_samples(project)
{
    for (let pattern of project.patterns)
        fetch_pattern_samples(pattern);
}

//============================================================================
// Audio output
//============================================================================

// Global volume/gain node
let global_gain = null;

// Master volume, in the [0, 1] range. This defaults to 50% to protect end
// users when loading somebody else's project (see design.md).
let volume = 0.5;

// Initialize the web audio context
async function init_web_audio()
{
    // If already initialized, stop
    if (global_gain)
        return;

    console.log('Initializing web audio');

    // Global volume node
    global_gain = audio_ctx.createGain();
    global_gain.gain.setValueAtTime(volume, audio_ctx.currentTime);
    global_gain.connect(audio_ctx.destination);

    // The audio context starts out in a paused state
    await audio_ctx.resume();
}

// Set the master volume, in the [0, 1] range
export function set_volume(new_volume)
{
    console.assert(new_volume >= 0 && new_volume <= 1);
    volume = new_volume;

    // The gain node only exists once the audio context is initialized
    if (global_gain)
        global_gain.gain.setValueAtTime(volume, audio_ctx.currentTime);
}

//============================================================================
// Playback scheduling
//
// Playback is scheduled ahead of time on the audio context clock, from a timer
// running on the main thread. The timer only has to keep up on average: it
// queues every step falling inside the lookahead window, so a late callback
// makes no audible difference as long as it lands within that window.
//============================================================================

// How far ahead of the audio clock we queue samples, in seconds
const LOOKAHEAD_TIME = 0.1;

// How often the playback update runs, in milliseconds
const UPDATE_INTERV_MS = 1000 / 25;

// Interval to update the audio playback
let update_interv = null;

// Project currently being played, and index of the pattern being played
let play_project = null;
let play_pat_idx = 0;

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

// Test if playback is currently running
export function is_playing()
{
    return update_interv != null;
}

// Start playing a single pattern of a project
export async function play_pattern(project, pat_idx)
{
    console.assert(!is_playing());
    console.assert(pat_idx < project.patterns.length);

    await init_web_audio();

    play_project = project;
    play_pat_idx = pat_idx;

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

// Stop playback
export function stop_playback()
{
    if (!is_playing())
        return;

    clearInterval(update_interv);
    update_interv = null;
    play_project = null;
}

// Update playback
function update_playback()
{
    // Read the step rate from the project on every update, so that changing
    // the tempo during playback takes effect immediately
    let steps_per_sec = play_project.steps_per_sec;

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

    // TODO: for now we only play one pattern,
    // song playback will need to scan every pattern active on the timeline
    let pat = play_project.patterns[play_pat_idx];

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
            if (pat.get_cell(row_idx, step_idx))
                samples.play_sample(pat.sample_idxs[row_idx], step_time, global_gain);
        }
    }

    last_time = queue_until_t;
    last_pos = queue_until_pos;
}
