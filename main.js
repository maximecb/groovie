import {
    Project,
    MIN_TEMPO,
    MAX_TEMPO,
    MIN_SWING,
    MAX_SWING,
    MIN_DELAY_TIME,
    MAX_DELAY_TIME,
    MIN_DELAY_FB,
    MAX_DELAY_FB,
    DELAY_FB_STEP,
    MIN_PAT_STEPS,
    MAX_PAT_STEPS,
    TITLE_STRIP_RE,
    clean_title,
    title_error,
    project_from_hash,
    project_to_hash,
} from "./model.js";

import {
    fetch_project_samples,
    set_volume,
    update_delay,
    is_playing,
    is_playing_pattern,
    is_playing_song,
    play_pattern,
    play_song,
    stop_playback,
    get_play_step,
    get_song_step,
    get_song_pat_step,
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
    update_slider_fill,
    delay_time_label,
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

// Swing slider
const swing_slider = document.getElementById('swing_slider');
const swing_val = document.getElementById('swing_val');

// Volume slider
const volume_slider = document.getElementById('volume_slider');
const volume_val = document.getElementById('volume_val');

// Delay time and feedback sliders
const delay_time_slider = document.getElementById('delay_time_slider');
const delay_time_val = document.getElementById('delay_time_val');
const delay_fb_slider = document.getElementById('delay_fb_slider');
const delay_fb_val = document.getElementById('delay_fb_val');

// Pattern length selector
const num_steps_sel = document.getElementById('num_steps');

// Button swapping the steps of a pattern for where its rows sit in the mix, on
// a screen too narrow to show both at once
const mixer_btn = document.getElementById('mixer_btn');

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

// Visit count in the page footer
const hit_count = document.getElementById('hit_count');

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
    swing_slider.value = project.swing;
    swing_val.textContent = project.swing;
    delay_time_slider.value = project.delay_time;
    delay_time_val.textContent = delay_time_label(project.delay_time);
    delay_fb_slider.value = project.delay_feedback;
    delay_fb_val.textContent = project.delay_feedback;
    update_slider_fill(tempo_slider);
    update_slider_fill(swing_slider);
    update_slider_fill(delay_time_slider);
    update_slider_fill(delay_fb_slider);

    // A project loaded from a link brings its own delay settings, and the
    // graph may still be ringing with the ones it replaced
    update_delay(project);
    num_steps_sel.value = pat.num_steps;
    song_title.value = project.title;
    update_page_title();

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

// Name the page after the project being edited, so that a tab and a bookmark
// say which project they hold. An untitled project leaves the page under the
// site's own name rather than under an empty one.
function update_page_title()
{
    document.title = project.title? `Groovie - ${project.title}` : 'Groovie';
}

//============================================================================
// Initialization
//============================================================================

// Let the tempo slider cover the range a tempo is allowed to be, so that it
// can't hand the project a tempo the encoding has no room for. render_all()
// sets its position, which has to happen after this: a value outside the range
// would be clamped into it.
tempo_slider.min = MIN_TEMPO;
tempo_slider.max = MAX_TEMPO;

// Likewise for swing, whose slider sits at its left end by default: an
// unswung project is one at the bottom of the range rather than in the
// middle of it.
swing_slider.min = MIN_SWING;
swing_slider.max = MAX_SWING;

// The delay time slider runs along the table of times rather than over a
// quantity, so its travel is that table's indices: every stop on it is a
// setting a musician would name, and dragging it steps between them.
delay_time_slider.min = MIN_DELAY_TIME;
delay_time_slider.max = MAX_DELAY_TIME;

// Feedback stops only where the encoding has a setting for it, so that the
// slider can't hand the project a value a link has no room for
delay_fb_slider.min = MIN_DELAY_FB;
delay_fb_slider.max = MAX_DELAY_FB;
delay_fb_slider.step = DELAY_FB_STEP;

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

// Keep the fill of the sliders at the top of the page up to date as they're
// dragged. Hooked up in one place rather than in each slider's own handler:
// how a control draws itself is the same job for all three, and none of them
// has to remember to do it. Their starting positions are set here too, the two
// a project owns being set again by render_all() once one is loaded.
//
// This only reaches the sliders the page loads with. The pan sliders are built
// per row as a pattern is rendered, and keep their own fill up to date.
for (let slider of document.querySelectorAll('input[type="range"]'))
{
    slider.addEventListener('input', () => update_slider_fill(slider));
    update_slider_fill(slider);
}

set_volume(volume_slider.valueAsNumber / 100);
fetch_project_samples(project);
render_all();

// Count this visit, and show what the count is now at. The service keeps every
// counter under one public namespace, so the key has to be specific enough not
// to land on somebody else's. The count is decoration: if the service can't be
// reached, the footer is left without it rather than saying anything about it.
fetch('https://countapi.mileshilliard.com/api/v1/hit/groovie_pointersgonewild')
    .then(rsp => rsp.json())
    .then(data =>
    {
        // The service answers errors with a JSON object of its own, which
        // carries no count. Anything that isn't a number is nothing to show.
        // Grouped in threes with commas, e.g. 1,603. The locale is pinned so
        // that it's commas everywhere: left to the visitor's own locale, the
        // separator would come out as a space or a period in much of Europe.
        let count = Number(data.value);
        if (Number.isFinite(count))
            hit_count.textContent = `${count.toLocaleString('en-US')} visits`;
    })
    .catch(err => console.error(`Could not get the visit count: ${err.message}`));

//============================================================================
// Input handling
//============================================================================

// Opening another project in a page that's already on the site: a link pasted
// into the address bar of this page, or the back button moving between hashes
// that were visited. The page isn't reloaded in either case, so the fragment is
// read again here rather than only at startup.
//
// Sharing writes the URL too, but does it with replaceState(), which doesn't
// fire this and so doesn't reload the project out from under the editor.
window.onhashchange = function ()
{
    let new_project;

    try
    {
        new_project = location.hash?
                      project_from_hash(location.hash) : new Project();
    }
    catch (err)
    {
        // The link carried nothing that could be shown. What's being edited is
        // left where it is rather than dropped for a blank project, which is no
        // more what the link said than the current one is.
        console.error(`Could not load project from URL: ${err.message}`);
        return;
    }

    // Whatever is playing belongs to the project being replaced
    stop_playback();

    // Focus is left over from the project being replaced, and the controls it
    // can be sitting on aren't rebuilt below, so it would stay there. On the
    // play button it also swallows the spacebar shortcut.
    document.activeElement?.blur();

    project = new_project;
    cur_pat = 0;

    // The note under the share button is about a link to the project that was
    // just replaced
    set_share_status('');

    fetch_project_samples(project);
    render_all();
}

tempo_slider.oninput = function ()
{
    project.set_tempo(tempo_slider.valueAsNumber);
    tempo_val.textContent = project.tempo;

    // Steps have a fixed duration, so the tempo is what says how long the song
    // in steps runs for
    update_song_len();

    // The delay is set in steps, so the tempo is what says how long it holds
    // a sound for
    update_delay(project);
}

// Swing redistributes the steps within each pair rather than changing how many
// of them go by, so it leaves the song length alone
swing_slider.oninput = function ()
{
    project.set_swing(swing_slider.valueAsNumber);
    swing_val.textContent = project.swing;
}

volume_slider.oninput = function ()
{
    volume_val.textContent = volume_slider.valueAsNumber;
    set_volume(volume_slider.valueAsNumber / 100);
}

// The delay controls are applied as they move rather than only at the next
// playback update, so that they can be worked while the music runs and so that
// a change is heard on a tail still ringing after it has stopped
delay_time_slider.oninput = function ()
{
    project.set_delay_time(delay_time_slider.valueAsNumber);
    delay_time_val.textContent = delay_time_label(project.delay_time);
    update_delay(project);
}

delay_fb_slider.oninput = function ()
{
    project.set_delay_feedback(delay_fb_slider.valueAsNumber);
    delay_fb_val.textContent = project.delay_feedback;
    update_delay(project);
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
    update_page_title();
}

// Fires when the field is left or return is pressed, which is the point where
// the title can be tidied up without getting in the way of typing it.
//
// Only the spaces are tidied. The field is deliberately not capped at the
// length a title can be, and a title too long to share is left with every
// character of itself: a field that silently swallowed the rest would say
// nothing about why, where making the link says it.
song_title.onchange = function ()
{
    project.title = clean_title(song_title.value);
    song_title.value = project.title;
    update_page_title();
}

// Say what the share button just did. What stopped a link from being made is
// marked as an error, rather than left to read like the note above it.
function set_share_status(msg, is_error = false)
{
    share_status.textContent = msg;
    share_status.classList.toggle('share_error', is_error);
}

share_btn.onclick = async function ()
{
    // The field can still hold a title mid-edit, i.e. one typed and then
    // shared without ever leaving the field
    project.title = clean_title(song_title.value);
    song_title.value = project.title;
    update_page_title();

    // A title travels in the link and is what names the track wherever it's
    // posted, so it's worth saying what's wrong with one rather than sharing
    // the project under a title nobody chose
    let title_err = title_error(project.title);

    if (title_err)
    {
        set_share_status(title_err, true);
        return;
    }

    let hash;

    try
    {
        hash = project_to_hash(project);
    }
    catch (err)
    {
        // The encoding refused the project rather than producing a link that
        // would open as something else. Nothing is copied and the URL is left
        // alone, so what's on screen is still what a reload would come back to.
        console.error(`Could not encode the project: ${err.message}`);
        set_share_status('Could not create a link for this project.', true);
        return;
    }

    // Replacing the URL rather than pushing it keeps sharing repeatable
    // without filling up the back button, and leaves the project where a
    // reload of the page will find it again
    history.replaceState(null, '', '#' + hash);

    let url = location.href;
    let length = `${url.length} characters`;

    if (url.length > MAX_URL_CHARS)
        length += ', which may be too long for some sites';

    try
    {
        await navigator.clipboard.writeText(url);
        set_share_status(`Link copied, ${length}.`);
    }
    catch (err)
    {
        // Copying needs both a secure context and the user's permission, so it
        // can't be counted on. The link is in the address bar either way.
        console.error(`Could not copy the link: ${err.message}`);
        set_share_status(`Link is in the address bar, ${length}.`);
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

    // Marks the button the stylesheet draws as stopping rather than starting
    play_pat.classList.toggle('playing', is_playing_pattern());
    play_song_btn.classList.toggle('playing', is_playing_song());

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

// Swap the steps of the pattern being edited for where its rows sit in the mix.
// A row can't hold both across a phone, so the stylesheet drops the mix there
// and this is what asks for it back, one or the other at a time.
//
// The grid is marked rather than its rows, so that a grid rebuilt while the mix
// is up comes back with the mix still up. It says nothing at the widths that
// have room for both: there the stylesheet shows them whatever this is set to,
// and the button itself isn't on the page.
mixer_btn.onclick = function ()
{
    let showing = pat_div.classList.toggle('show_mixer');
    mixer_btn.setAttribute('aria-pressed', showing);
}

// The timeline draws as many bars as fit across it, which the stylesheet has no
// way to work out on its own, so it is the one part of the page that has to be
// laid out again when the room it has changes. The box is watched rather than
// the window, that being what actually decides how many bars there is room for:
// a window resize is only one of the ways it can change.
//
// The width it was last laid out for is kept, so that a change leaving it alone
// rebuilds nothing. That covers the first call, which arrives as soon as the box
// is watched, along with the changes a phone makes on its own when the address
// bar slides away or the keyboard opens.
let tl_width = pat_seq.clientWidth;

new ResizeObserver(() =>
{
    if (pat_seq.clientWidth == tl_width)
        return;

    tl_width = pat_seq.clientWidth;
    render_timeline(pat_seq, project, cur_pat, timeline_handlers);
}).observe(pat_seq);

// The spacebar plays and stops what there is to hear, which is the one thing
// worth a keyboard shortcut. It's ignored while a control has focus, so that it
// still does whatever that control does with it.
//
// That's the song, except when nothing has been placed on the timeline yet, in
// which case it's the pattern being edited. A project starts out with an empty
// timeline and the shortcut would otherwise do nothing at all there, which is
// the one state where it can't say so: the song button greys itself out when
// there is no song, and a key has no way to.
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

    if (project.song_num_steps == 0)
        await play_pattern(project, cur_pat);
    else
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

    // Song playback has several patterns sounding at once, so the timeline
    // playhead is what says where the song as a whole is. The pattern on screen
    // is one of the several, and shows the step of itself being heard wherever
    // the timeline places it. Where it isn't placed it isn't sounding, and its
    // grid shows nothing rather than a step that can't be heard.
    //
    // The tab strip stays out of it: it marks one playing pattern, and during
    // song playback there is no one pattern to mark.
    if (is_playing_song())
    {
        highlight_step(get_song_pat_step(cur_pat));
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
