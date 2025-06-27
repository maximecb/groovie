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

    // Generate HTML DOM nodes for the pattern grid
    gen_grid(pat_div)
    {
        // Create a div representing one cell
        function make_cell(row_idx, step_idx)
        {
            // The outer cell div is the element reacting to clicks
            // It's larger and therefore easier to click
            var cell = document.createElement('div');
            cell.style['display'] = 'inline-block';

            /*
            // 4-step beat separator
            if (i % 4 == 0)
            {
                let sep = document.createElement('div');
                sep.style['display'] = 'inline-block';
                sep.style['width'] = '1px';
                cell.appendChild(sep);
            }
            */

            // The inner div is the colored/highlighted element
            let inner = document.createElement('div');
            let cell_on = this.rows[row_idx][step_idx];
            inner.className = cell_on? 'cell on':'cell off';
            cell.appendChild(inner);

            /*
            // 4-step beat separator
            if (step_idx % 4 == 3)
            {
                var sep = document.createElement('div');
                sep.style['display'] = 'inline-block';
                sep.style['width'] = '1px';
                cell.appendChild(sep);
            }
            */

            //cell.onpointerdown = (evt) => evt.stopPropagation();
            //cell.onpointerup = (evt) => evt.stopPropagation();

            cell.onclick = (evt) =>
            {
                console.log(`clicked row_idx=${row_idx}, step_idx=${step_idx}`);

                let cell_on = !this.rows[row_idx][step_idx];
                this.rows[row_idx][step_idx] = cell_on;
                inner.className = cell_on? 'cell on':'cell off';

                evt.stopPropagation();
            };

            return cell;
        }

        // Create a div representing one bar
        function make_bar(bar_idx, num_steps)
        {
            let bar = document.createElement('div');
            bar.style['display'] = 'inline-block';
            bar.style['margin'] = '0px 2px';

            for (var row_idx = 0; row_idx < this.rows.length; ++row_idx)
            {
                let row = document.createElement('div');

                for (let i = 0; i < num_steps; ++i)
                {
                    let step_idx = bar_idx * 16 + i;
                    let cell = make_cell.call(this, row_idx, step_idx);
                    row.appendChild(cell);
                }

                bar.appendChild(row);
            }

            return bar;
        }

        // For each bar of the pattern
        for (var bar_idx = 0; bar_idx < this.num_bars; ++bar_idx)
        {
            let bar_div = document.createElement('div');
            bar_div.style['display'] = 'inline-block';
            pat_div.appendChild(bar_div);

            let bar = make_bar.call(this, bar_idx, this.steps_per_bar);
            bar_div.appendChild(bar);

            // If this is not the last bar, add a separator
            if (bar_idx < this.num_bars - 1)
            {
                let bar_height = this.rows.length * 16;
                let sep = document.createElement('div');
                sep.style['display'] = 'inline-block';
                sep.style['width'] = '3px';
                sep.style['height'] = (bar_height - 4) + 'px';
                sep.style['background'] = '#900';
                sep.style['margin'] = '2px 1px';
                bar_div.appendChild(sep);
            }
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

// Volume slider
const volume_slider = document.getElementById('volume_slider');

// Pattern editor div
const pat_div = document.getElementById('pat_div');

// Tempo in beats per minute
let tempo = 120;

// List of patterns
let patterns = Array(8);

// Create a first pattern
patterns[0] = new Pattern();

patterns[0].gen_grid(pat_div);

// Currently selected pattern
let cur_pat = 0;

// Interval to update the audio playback
let update_interv = null;

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

play_pat.onclick = function ()
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

    init_web_audio();

    //let sample_idx = patterns[0].sample_idxs[0];
    //samples.play_sample(sample_idx, audio_ctx.currentTime, audio_ctx.destination);

    // Schedule update callback
    update_interv = setInterval(update_playback, 1000 / 25)
}


// Time at the last playback update
let last_time = 0;

// Time we last queued until, in fractional bars
let last_pos = 0;



// Update playback
function update_playback()
{
    // Get the current tempo in beats per minute
    // Convert it to bars per second
    let tempo_bpm = tempo_slider.valueAsNumber;
    let bars_per_sec = tempo_bpm / (60 * 4);

    // Time to queue until
    let queue_until_t = audio_ctx.currentTime + 0.1;

    // Compute how far to move ahead in bars
    let delta_time = queue_until_t - last_time;
    let delta_bars = delta_time * bars_per_sec;
    let queue_until_pos = last_pos + delta_bars;



    // TODO: start by just scanning the current pattern










    last_time = queue_until_t;
    last_pos = queue_until_pos;
}