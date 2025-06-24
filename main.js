import { SAMPLE_PATHS } from "./sample_list.js";
console.assert(SAMPLE_PATHS.length > 0);

class SampleManager
{
    constructor()
    {
        // Construct a mapping of sample names to indices
        this.names_to_idxs = new Map();
        for (let sample_idx = 0; sample_idx < SAMPLE_PATHS.length; ++sample_idx)
        {
            let sample_path = SAMPLE_PATHS[sample_idx];
            let sample_name = sample_path.match(/samples\/(.+)\.wav/)[1];
            console.assert(typeof sample_name == 'string');
            this.names_to_idxs.set(sample_name, sample_idx);
        }

        // Audio buffers for the samples
        this.sample_bufs = Array(SAMPLE_PATHS.length);
    }

    // Fetch/download a sample by index
    // Note that this only requests to load the sample asynchronously.
    // This function doesn't return anything
    fetch_sample(sample_idx)
    {
        console.assert(sample_idx < SAMPLE_PATHS.length);

        // Check if sample already loaded
        if (this.sample_bufs[sample_idx])
            return;

        let sample_path = SAMPLE_PATHS[sample_idx];
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
        console.assert(sample_idx < SAMPLE_PATHS.length);

        // This will return undefined if the sample is not yet loaded
        return this.sample_bufs[sample_idx];
    }

    // Get the index for a given sample name
    get_idx(sample_name)
    {
        console.assert(this.names_to_idxs.has(sample_name));
        return this.names_to_idxs.get(sample_name);
    }

    // Play a sample at a given time
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

        // Start playback at the specified time index
        source.start(0, start_time);
    }
}

class Pattern
{
    constructor()
    {
        this.steps_per_bar = 16;
        this.num_bars = 1;
        this.num_steps = this.steps_per_bar * this.num_bars;

        // Default samples
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

        // Initialize grid cells
        this.rows = Array(this.sample_idxs.length);
        for (let i = 0; i < this.rows.length; ++i)
        {
            this.rows[i] = Array(this.steps_per_bar * this.num_bars);
            this.rows[i].fill(0);
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

// Volume slider
const volume_slider = document.getElementById('volume_slider');

// Tempo in beats per minute
let tempo = 120;

// List of patterns
let patterns = Array(8);

// Create a first pattern
patterns[0] = new Pattern();

// Currently selected pattern
let cur_pat = 0;

// Initialize the web audio context
async function init_web_audio()
{
    if (global_gain)
        return;

    console.log('Initializing web audio');

    // Global volume node
    global_gain = audio_ctx.createGain();
    global_gain.gain.setValueAtTime(volume_slider.valueAsNumber, audio_ctx.currentTime);
    global_gain.connect(audio_ctx.destination);

    // The audio context starts out in a paused state
    await audio_ctx.resume();
}

play_pat.onclick = function ()
{
    init_web_audio();


    let sample_idx = patterns[0].sample_idxs[0];
    samples.play_sample(sample_idx, audio_ctx.currentTime, audio_ctx.destination);


}



