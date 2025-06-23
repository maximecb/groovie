import { SAMPLE_PATHS } from "./sample_list.js";
console.assert(SAMPLE_PATHS.length > 0);

class SampleManager
{
    constructor()
    {
        // Audio buffers for the samples
        this.sample_bufs = Array(SAMPLE_PATHS.length);

        // Dummy empty buffer for not yet loaded samples
        this.empty_buf = new AudioBuffer({
            length: 1,
            sampleRate: 44100,
            numberOfChannels: 1
        });
    }

    // Load a sample by index
    // Note that this only requests to load the sample asynchronously.
    // This function doesn't return anything
    load_sample(sample_idx)
    {
        console.assert(sample_idx < SAMPLE_PATHS.length);

        // Check if sample already loaded
        if (this.sample_bufs[sample_idx])
            return;

        fetch(SAMPLE_PATHS[sample_idx])
        .then(response => response.arrayBuffer())
        .then(array_buffer => ctx.decodeAudioData(array_buffer))
        .then(audio_buffer => this.sample_bufs[sample_idx] = audio_buffer)
        .catch(err => console.error(err));
    }

    // Get the audio buffer for a sample
    get_buffer(sample_idx)
    {
        let buf = this.sample_bufs[sample_idx];

        if (!buf)
            return this.empty_buf;

        return buf;
    }
}

class Pattern
{
    constructor()
    {
        this.steps_per_bar = 16;
        this.num_bars = 1;
        this.num_steps = this.steps_per_bar * this.num_bars;

        // Initialize grid cells
        this.rows = Array(6);
        for (let i = 0; i < this.rows.length; ++i)
        {
            this.rows[i] = Array(this.steps_per_bar * this.num_bars);
            this.rows[i].fill(0);
        }

        // TODO: default samples
        this.sample_idxs = Array(this.rows.length);
        for (let i = 0; i < this.rows.length; ++i)
        {
            this.sample_idxs[i] = 0;
        }
    }
}

// Audio context
let audio_ctx = null;

const samples = new SampleManager();

// Play pattern button
const play_pat = document.getElementById('play_pat');

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
    if (audio_ctx)
        return;

    console.log('Initializing web audio');

    // Create AudioContext with 44.1kHz sample rate
    audio_ctx = new AudioContext({
        sampleRate: 44100,
    });

    await audio_ctx.resume();
}

play_pat.onclick = function ()
{
    init_web_audio();



}



