import {
    Project,
    MIN_PAT_STEPS,
    MAX_PAT_STEPS,
    MAX_TITLE_CHARS,
    TITLE_STRIP_RE,
    normalize_title,
    project_from_hash,
    project_to_hash,
} from "./model.js";

import {
    fetch_project_samples,
    set_volume,
    is_playing,
    is_playing_pattern,
    is_playing_song,
    play_pattern,
    play_song,
    stop_playback,
    get_play_step,
    get_song_step,
    get_play_pat_idx,
    get_queued_pat_idx,
    queue_pattern,
    pattern_deleted,
} from "./audio.js";

import {
    render_pattern,
    render_pat_tabs,
    render_timeline,
    highlight_step,
    highlight_song_step,
    highlight_pat_tabs,
} from "./view.js";

//============================================================================
// DOM elements
//============================================================================

// Play pattern and play song buttons
const play_pat = document.getElementById('play_pat');
const play_song_btn = document.getElementById('play_song');

// Tempo slider
const tempo_slider = document.getElementById('tempo_slider');
const tempo_val = document.getElementById('tempo_val');

// Volume slider
const volume_slider = document.getElementById('volume_slider');
const volume_val = document.getElementById('volume_val');

// Pattern length selector
const num_steps_sel = document.getElementById('num_steps');

// Pattern selection tabs
const pat_tabs = document.getElementById('pat_tabs');

// Pattern editor div
const pat_div = document.getElementById('pat_div');

// Timeline div
const pat_seq = document.getElementById('pat_seq');

// Song length readout, below the timeline
const song_len = document.getElementById('song_len');

// Title field, the button copying a link to the project, and the line saying
// what that button last did
const song_title = document.getElementById('song_title');
const share_btn = document.getElementById('share_btn');
const share_status = document.getElementById('share_status');

// How long a URL can get before it stops surviving the places projects get
// shared in. Browsers and the sites people post links on all handle a couple
// of thousand characters (see design.md), so this is where a link stops being
// dependable rather than where it stops working.
const MAX_URL_CHARS = 2000;

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

// What clicking the pattern tabs does. Which pattern is being edited is a
// property of the editing session rather than of the project, so the tab strip
// reports clicks back here instead of tracking a selection of its own.
const tab_handlers = {

    // Selecting a pattern shows it for editing right away. It only starts
    // playing at the end of the current pattern's cycle, so that switching
    // patterns during playback doesn't cut off what's being heard.
    select: (pat_idx) =>
    {
        cur_pat = pat_idx;
        queue_pattern(pat_idx);
        render_all();
    },

    create: () => select_new_pattern(project.new_pattern(cur_pat)),
    copy: () => select_new_pattern(project.copy_pattern(cur_pat)),
    delete: () => delete_pattern(),
};

// What clicking the timeline does
const timeline_handlers = {

    // Selecting a pattern from its lane opens it for editing, the way its tab
    // does. It doesn't queue the pattern: during song playback what plays is
    // what the timeline says, and the pattern play button starts from the
    // pattern shown either way.
    select: (pat_idx) =>
    {
        cur_pat = pat_idx;
        render_all();
    },

    // Placing or removing a pattern can make the song longer or shorter, which
    // moves the loop point and the room shown past it, so the whole timeline
    // is redrawn rather than just the cell that was clicked
    toggle: (pat_idx, cell_idx) =>
    {
        project.toggle_lane_cell(pat_idx, cell_idx);
        render_timeline(pat_seq, project, cur_pat, timeline_handlers);
        update_play_buttons();
        update_song_len();
    },
};

// Switch to a pattern that was just created, if it could be created at all.
// Both ways of creating one produce a pattern playing the same samples as the
// current one, so there is nothing new to load.
function select_new_pattern(pat_idx)
{
    if (pat_idx === null)
        return;

    cur_pat = pat_idx;
    render_all();
}

// Re-render everything from the project state
function render_all()
{
    let pat = project.patterns[cur_pat];

    tempo_slider.value = project.tempo;
    tempo_val.textContent = project.tempo;
    num_steps_sel.value = pat.num_steps;
    song_title.value = project.title;

    render_pat_tabs(pat_tabs, project, cur_pat, tab_handlers);
    render_pattern(pat_div, pat, cur_pat);
    render_timeline(pat_seq, project, cur_pat, timeline_handlers);
    update_play_buttons();
    update_song_len();

    // The strip was rebuilt, so it has to be told what's playing again
    highlight_pat_tabs(get_play_pat_idx(), get_queued_pat_idx());
}

// Say how long the song is. Steps are what the timeline is laid out in, and
// what the length is a whole number of, so the time they come to is given
// alongside them rather than on its own.
function update_song_len()
{
    let num_steps = project.song_num_steps;
    let secs = num_steps / project.steps_per_sec;
    song_len.textContent = `Song length: ${num_steps} steps (${secs.toFixed(1)}s)`;
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

// Stop the title field at the length a title is allowed to be, so that the
// field refuses the extra characters rather than the encoding quietly
// dropping them later
song_title.maxLength = MAX_TITLE_CHARS;

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

    // Steps have a fixed duration, so the tempo is what says how long the song
    // in steps runs for
    update_song_len();
}

volume_slider.oninput = function ()
{
    volume_val.textContent = volume_slider.valueAsNumber;
    set_volume(volume_slider.valueAsNumber / 100);
}

num_steps_sel.onchange = function ()
{
    project.patterns[cur_pat].set_num_steps(Number(num_steps_sel.value));
    render_pattern(pat_div, project.patterns[cur_pat], cur_pat);

    // A timeline cell is one playthrough of its pattern, so changing a
    // pattern's length changes how much of the song each of its cells covers
    render_timeline(pat_seq, project, cur_pat, timeline_handlers);
    update_play_buttons();
    update_song_len();
}

// Only the characters a title can hold are kept, so that what the field shows
// is what ends up in the link. Spaces are tidied up only once the field is
// done being edited: collapsing runs of them on every keystroke would make it
// impossible to type a space between two words.
song_title.oninput = function ()
{
    let clean = song_title.value.replaceAll(TITLE_STRIP_RE, '');

    if (clean != song_title.value)
    {
        // Assigning the value drops the caret at the end, so it's put back
        // where it was, less whatever was just refused ahead of it
        let caret = song_title.selectionStart -
                    (song_title.value.length - clean.length);
        song_title.value = clean;
        song_title.setSelectionRange(caret, caret);
    }

    project.title = clean;
}

// Fires when the field is left or return is pressed, which is the point where
// the title can be tidied up without getting in the way of typing it
song_title.onchange = function ()
{
    project.title = normalize_title(song_title.value);
    song_title.value = project.title;
}

share_btn.onclick = async function ()
{
    // The field can still hold a title mid-edit, i.e. one typed and then
    // shared without ever leaving the field
    project.title = normalize_title(song_title.value);
    song_title.value = project.title;

    // Replacing the URL rather than pushing it keeps sharing repeatable
    // without filling up the back button, and leaves the project where a
    // reload of the page will find it again
    history.replaceState(null, '', '#' + project_to_hash(project));

    let url = location.href;
    let length = `${url.length} characters`;

    if (url.length > MAX_URL_CHARS)
        length += ', which may be too long for some sites';

    try
    {
        await navigator.clipboard.writeText(url);
        share_status.textContent = `Link copied, ${length}.`;
    }
    catch (err)
    {
        // Copying needs both a secure context and the user's permission, so it
        // can't be counted on. The link is in the address bar either way.
        console.error(`Could not copy the link: ${err.message}`);
        share_status.textContent = `Link is in the address bar, ${length}.`;
    }
}

function delete_pattern()
{
    // Deleting a pattern that plays nothing costs the user nothing, so only a
    // pattern with something in it is worth interrupting them over
    if (!project.patterns[cur_pat].is_inactive())
    {
        if (!confirm(`Delete pattern ${cur_pat + 1}?`))
            return;
    }

    if (!project.delete_pattern(cur_pat))
        return;

    // Playback refers to patterns by index too, and the indices after the one
    // deleted have all shifted down
    pattern_deleted(cur_pat);

    // The pattern list got shorter, so the selection can now be past its end
    cur_pat = Math.min(cur_pat, project.num_patterns - 1);

    render_all();
}

// Each play button doubles as the stop button for what it plays, so it names
// whichever action it performs next rather than what it's currently doing.
// Only one of the two can be playing at a time.
function update_play_buttons()
{
    play_pat.textContent = is_playing_pattern()? 'Stop':'Play';
    play_song_btn.textContent = is_playing_song()? 'Stop':'Play';

    // Nothing is placed on the timeline, so there is no song to play. The
    // button stays live while the song plays, since emptying the timeline
    // during playback has to leave a way to stop it.
    play_song_btn.disabled = !is_playing_song() && project.song_num_steps == 0;
}

play_pat.onclick = async function ()
{
    if (is_playing_pattern())
    {
        console.log('Stopping playback');
        stop_playback();
        update_play_buttons();
        return;
    }

    console.log('Starting pattern playback');

    // Playing a pattern stops the song, if that's what was playing
    await play_pattern(project, cur_pat);
    start_highlight();
}

play_song_btn.onclick = async function ()
{
    if (is_playing_song())
    {
        console.log('Stopping playback');
        stop_playback();
        update_play_buttons();
        return;
    }

    console.log('Starting song playback');

    await play_song(project);
    start_highlight();
}

// The spacebar plays and stops the song, which is the one thing worth a
// keyboard shortcut. It's ignored while a control has focus, so that it still
// does whatever that control does with it.
document.onkeydown = async function (evt)
{
    if (evt.code != 'Space')
        return;

    let focus_tag = document.activeElement?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(focus_tag))
        return;

    // Otherwise the spacebar scrolls the page
    evt.preventDefault();

    if (is_playing())
    {
        stop_playback();
        update_play_buttons();
        return;
    }

    await play_song(project);
    start_highlight();
}

// Pending animation frame for the playback highlight, null when not running
let highlight_req = null;

// Follow whatever is now playing with the playback highlight. A loop may still
// be winding down from a previous playback, in which case it just keeps going.
function start_highlight()
{
    update_play_buttons();

    if (highlight_req === null)
        highlight_req = requestAnimationFrame(update_highlight);
}

// Move the playback highlight to the position currently being heard. This runs
// off animation frames rather than off the scheduler, because the scheduler
// queues steps ahead of time and the highlight has to track what's audible.
function update_highlight()
{
    // Playback stopped, clear the highlight and let the loop end. The buttons
    // are updated here too, so that they still end up right if playback stops
    // somewhere other than a button's own handler.
    if (!is_playing())
    {
        highlight_step(null);
        highlight_pat_tabs(null, null);
        highlight_song_step(null);
        update_play_buttons();
        highlight_req = null;
        return;
    }

    // Song playback has several patterns sounding at once, so there is nothing
    // one pattern grid can usefully show: the timeline playhead is what says
    // where playback is, and the pattern editor stays out of it.
    if (is_playing_song())
    {
        highlight_step(null);
        highlight_pat_tabs(null, null);
        highlight_song_step(get_song_step());
    }
    else
    {
        // The pattern on screen is not always the one being heard: a pattern
        // selected during playback is shown right away, but only takes over at
        // the end of the current pattern's cycle. The grid it shows isn't
        // playing yet, so there is no step of it to highlight.
        highlight_step(get_play_pat_idx() === cur_pat? get_play_step() : null);
        highlight_pat_tabs(get_play_pat_idx(), get_queued_pat_idx());
        highlight_song_step(null);
    }

    highlight_req = requestAnimationFrame(update_highlight);
}
