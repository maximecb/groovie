import {
    Project,
    MIN_PAT_STEPS,
    MAX_PAT_STEPS,
    project_from_hash,
} from "./model.js";

import {
    fetch_project_samples,
    set_volume,
    is_playing,
    play_pattern,
    stop_playback,
    get_play_step,
} from "./audio.js";

import { render_pattern, render_timeline, highlight_step } from "./view.js";

//============================================================================
// DOM elements
//============================================================================

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

// Timeline div
const pat_seq = document.getElementById('pat_seq');

//============================================================================
// Application state
//============================================================================

// The project currently being edited
let project = load_project();

// Index of the pattern currently shown in the pattern editor
let cur_pat = 0;

// Load the project from the URL fragment, if there is one there
function load_project()
{
    if (!location.hash)
        return new Project();

    try
    {
        return project_from_hash(location.hash);
    }
    catch (err)
    {
        console.error(`Could not load project from URL: ${err.message}`);
        return new Project();
    }
}

// Re-render everything from the project state
function render_all()
{
    let pat = project.patterns[cur_pat];

    tempo_slider.value = project.tempo;
    tempo_val.textContent = project.tempo;
    num_steps_sel.value = pat.num_steps;

    render_pattern(pat_div, pat);
    render_timeline(pat_seq, project);
}

//============================================================================
// Initialization
//============================================================================

// Populate the pattern length selector. Every length in the valid range is
// selectable: steps have a fixed duration, so a pattern length isn't a
// subdivision of anything, and the odd lengths are the ones that produce
// interesting phasing against other patterns.
for (let num_steps = MIN_PAT_STEPS; num_steps <= MAX_PAT_STEPS; ++num_steps)
{
    let option = document.createElement('option');
    option.value = num_steps;
    option.textContent = num_steps;
    num_steps_sel.appendChild(option);
}

set_volume(volume_slider.valueAsNumber / 100);
fetch_project_samples(project);
render_all();

//============================================================================
// Input handling
//============================================================================

tempo_slider.oninput = function ()
{
    project.set_tempo(tempo_slider.valueAsNumber);
    tempo_val.textContent = project.tempo;
}

volume_slider.oninput = function ()
{
    volume_val.textContent = volume_slider.valueAsNumber;
    set_volume(volume_slider.valueAsNumber / 100);
}

num_steps_sel.onchange = function ()
{
    project.patterns[cur_pat].set_num_steps(Number(num_steps_sel.value));
    render_pattern(pat_div, project.patterns[cur_pat]);
}

// The play button doubles as the stop button, so it names whichever action it
// performs next rather than what it's currently doing
function update_play_button()
{
    play_pat.textContent = is_playing()? 'Stop':'Play';
}

play_pat.onclick = async function ()
{
    // If already playing, stop playback
    if (is_playing())
    {
        console.log('Stopping playback');
        stop_playback();
        update_play_button();
        return;
    }

    console.log('Starting pattern playback');

    await play_pattern(project, cur_pat);
    update_play_button();

    // Follow the playback position with the grid highlight. A loop may still be
    // winding down from a previous playback, in which case it just keeps going.
    if (highlight_req === null)
        highlight_req = requestAnimationFrame(update_highlight);
}

// Pending animation frame for the playback highlight, null when not running
let highlight_req = null;

// Move the pattern grid highlight to the step currently being heard. This runs
// off animation frames rather than off the scheduler, because the scheduler
// queues steps ahead of time and the highlight has to track what's audible.
function update_highlight()
{
    let play_step = get_play_step();

    // Playback stopped, clear the highlight and let the loop end. The button is
    // updated here too, so that it still ends up right if playback stops
    // somewhere other than the button's own handler.
    if (play_step === null)
    {
        highlight_step(null);
        update_play_button();
        highlight_req = null;
        return;
    }

    highlight_step(play_step % project.patterns[cur_pat].num_steps);

    highlight_req = requestAnimationFrame(update_highlight);
}
