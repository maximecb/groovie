import {
    SORTED_SAMPLE_IDXS,
    get_sample_name,
    fetch_sample,
    preview_sample,
} from "./audio.js";
import {
    MAX_PAT_ROWS,
    MAX_PATTERNS,
    MAX_SONG_STEPS,
    MIN_PAN,
    MAX_PAN,
    STEPS_PER_BAR,
} from "./model.js";

//============================================================================
// DOM rendering
//
// The views are a function of the model: rendering reads the project state and
// never stores state of its own. That's what makes it possible to drop in a
// project decoded from a URL and just re-render.
//============================================================================

// Colors of the 12-band rainbow, one per pattern. A pattern is drawn in its
// color both on the timeline lane that places it and in the grid that edits
// it, so that the two read as the same thing. A project can hold more patterns
// than there are colors here, so the colors repeat.
//
// The bands at the violet end of the rainbow are much darker than the rest, so
// they're lightened here to hold their own against the yellows against a dark
// background. The hues are the ones the rainbow has.
const PAT_COLORS = [
    '#d926d3',
    '#7433ff',
    '#0551ff', // Bright blue
    '#00d0d0',
    '#00fa00',
    '#cbfa00',
    '#fefb00',
    '#fec802',
    '#ff9501',
    '#ff5004',
    '#fe2204',
    '#d81d52'
];

// Give an element the color of a pattern. The cells inside it are painted from
// this in the stylesheet, which keeps the palette out of the rules drawing them.
function set_pat_color(div, pat_idx)
{
    div.style.setProperty('--pat_color', PAT_COLORS[pat_idx % PAT_COLORS.length]);
}

// Step column currently highlighted in the pattern grid, null if none
let cur_highlight = null;

// The cell divs the last render produced, indexed [row_idx][step_idx]. The
// playback highlight looks cells up here rather than walking the grid DOM,
// which keeps it independent of the per-row controls around the cells.
let cell_divs = [];

// Highlight the step being played in the pattern grid, or clear the highlight
// when step_idx is null. This runs on every animation frame, so it only
// touches the two columns that change instead of rebuilding the grid.
export function highlight_step(step_idx)
{
    if (step_idx === cur_highlight)
        return;

    for (let row_cells of cell_divs)
    {
        // A column may be gone if the pattern got shorter
        let old_cell = row_cells[cur_highlight];
        if (old_cell)
            old_cell.classList.remove('playing');

        let new_cell = row_cells[step_idx];
        if (new_cell)
            new_cell.classList.add('playing');
    }

    cur_highlight = step_idx;
}

// The pattern tab divs the last render produced, indexed by pattern index
let tab_divs = [];

// Pattern indices the tab strip is currently showing as playing and as queued
let cur_play_tab = null;
let cur_queued_tab = null;

// Mark which pattern is being heard, and which one is waiting to take over
// from it. Like the step highlight, this runs on every animation frame, so it
// only touches the strip when what it shows has gone stale.
export function highlight_pat_tabs(play_idx, queued_idx)
{
    if (play_idx === cur_play_tab && queued_idx === cur_queued_tab)
        return;

    for (let pat_idx = 0; pat_idx < tab_divs.length; ++pat_idx)
    {
        tab_divs[pat_idx].classList.toggle('playing', pat_idx === play_idx);
        tab_divs[pat_idx].classList.toggle('queued', pat_idx === queued_idx);
    }

    cur_play_tab = play_idx;
    cur_queued_tab = queued_idx;
}

// Generate the DOM for the pattern tab strip, i.e. one numbered tab per
// pattern, followed by the buttons that create new patterns.
//
// The strip is how patterns are switched between, which the handlers report
// back: which pattern is being edited is a property of the editing session
// rather than of the project, and so lives outside of the model.
export function render_pat_tabs(tabs_div, project, cur_pat, handlers)
{
    // Create the tab selecting a given pattern. Tabs are numbered from 1,
    // which is how patterns are referred to in the interface.
    function make_tab(pat_idx)
    {
        let button = document.createElement('button');
        button.className = 'pat_tab';
        button.textContent = pat_idx + 1;
        button.title = `Edit pattern ${pat_idx + 1}`;

        if (pat_idx == cur_pat)
            button.classList.add('selected');

        button.onclick = () => handlers.select(pat_idx);

        return button;
    }

    // Create one of the buttons that add a pattern at the end of the strip.
    // They're dashed and dim, like the button that adds a row to a pattern, so
    // that they read as patterns waiting to exist rather than as controls.
    function make_add_button(label, title, on_click)
    {
        let button = document.createElement('button');
        button.className = 'pat_tab add_pat';
        button.textContent = label;
        button.title = title;
        button.onclick = on_click;

        return button;
    }

    // The strip is rebuilt, so nothing carries the playback state anymore
    cur_play_tab = null;
    cur_queued_tab = null;
    tab_divs = [];

    tabs_div.replaceChildren();

    for (let pat_idx = 0; pat_idx < project.num_patterns; ++pat_idx)
    {
        let tab = make_tab(pat_idx);
        tab_divs.push(tab);
        tabs_div.appendChild(tab);
    }

    // A project that can't hold any more patterns gets no add buttons
    if (project.num_patterns < MAX_PATTERNS)
    {
        tabs_div.appendChild(make_add_button(
            '+',
            'Create a new empty pattern',
            handlers.create
        ));

        tabs_div.appendChild(make_add_button(
            'Copy',
            'Create a copy of the current pattern',
            handlers.copy
        ));
    }

    // Deleting the pattern being edited belongs with the buttons that create
    // patterns, but acts on one that already exists, so it doesn't take on
    // their unbuilt look. It stays in place when the add buttons are gone: a
    // full project is where deleting a pattern is most worth reaching for.
    let del_button = document.createElement('button');
    del_button.className = 'pat_tab del_pat';
    del_button.textContent = 'Delete';
    del_button.title = `Delete pattern ${cur_pat + 1}`;
    del_button.onclick = handlers.delete;

    // A project always holds at least one pattern
    del_button.disabled = (project.num_patterns <= 1);

    tabs_div.appendChild(del_button);
}

// A select element listing every sample, cloned once per pattern row. The
// option list is built only once: there are a few hundred samples, and the
// grid is rebuilt every time the pattern length changes.
let sample_sel_template = null;

// Get the sample selection template, building it on the first call
function get_sample_sel_template()
{
    if (sample_sel_template)
        return sample_sel_template;

    sample_sel_template = document.createElement('select');
    sample_sel_template.className = 'sample_sel';

    // Samples are named without their directory or file extension, which is
    // how they're referred to everywhere outside of the samples directory
    for (let sample_idx of SORTED_SAMPLE_IDXS)
    {
        let option = document.createElement('option');
        option.value = sample_idx;
        option.textContent = get_sample_name(sample_idx);
        sample_sel_template.appendChild(option);
    }

    return sample_sel_template;
}

// Tell a slider's track how much of it to fill, style.css drawing the color
// from that. This is how far along its range the handle sits, which CSS can't
// read off a range input by itself.
//
// This lives here rather than in main.js because the pan sliders are built
// here, one per row, every time a pattern is rendered: a slider that arrives
// after the page has loaded has to be given its fill by whatever made it.
export function update_slider_fill(slider)
{
    let min = Number(slider.min);
    let max = Number(slider.max);
    let frac = (slider.valueAsNumber - min) / (max - min);
    slider.style.setProperty('--val', `${100 * frac}%`);
}

// How a stereo position reads on a mixer: a side and how far towards it, as a
// percentage, with the centre named rather than numbered. The model holds pan
// in tenths, which is what makes these whole numbers.
export function pan_label(pan)
{
    if (pan == 0)
        return 'C';

    return (pan < 0? 'L' : 'R') + Math.abs(10 * pan);
}

// Generate the DOM for a pattern grid, replacing whatever the div held before.
// The pattern index is what says which color the grid is drawn in, and is the
// same one its timeline lane uses.
export function render_pattern(pat_div, pattern, pat_idx)
{
    // Create the drop-down used to select the sample a row plays
    function make_sample_sel(row_idx)
    {
        let select = get_sample_sel_template().cloneNode(true);

        // A row can name a sample index that has no sample behind it, which no
        // option matches. The select then shows up blank, and the row stays
        // silent until a sample is picked, which is what playback does too.
        select.value = pattern.sample_idxs[row_idx];

        select.onchange = () =>
        {
            let sample_idx = Number(select.value);
            pattern.set_row_sample(row_idx, sample_idx);

            // Play the new sample once, so that picking a sample is a matter of
            // hearing it rather than of recognizing its name. This loads it too,
            // which is what the row needs to play it from here on.
            preview_sample(sample_idx);
        };

        return select;
    }

    // Create the button that adds a row to the pattern. It's shaped like a row
    // of its own and sits at the bottom of the grid, lined up under the sample
    // selects, so that it reads as the next row waiting to exist.
    function make_add_row()
    {
        let row_div = document.createElement('div');
        row_div.className = 'pat_row';

        let button = document.createElement('button');
        button.className = 'add_row';
        button.textContent = '+ row';
        button.title = 'Add a row to this pattern';

        button.onclick = () =>
        {
            let sample_idx = pattern.next_row_sample();
            pattern.add_row(sample_idx);

            // Load the sample the new row starts out playing
            fetch_sample(sample_idx);

            // The grid has a row more than it's showing, so it gets rebuilt
            render_pattern(pat_div, pattern, pat_idx);
        };

        row_div.appendChild(button);

        return row_div;
    }

    // Create the stereo pan control on the right of a row. A slider rather than
    // the knob design.md called for: the page is built out of sliders already,
    // and a slider can be dragged, tabbed to and arrowed along without any of
    // the pointer handling a knob would need to turn a drag into an angle.
    function make_pan_ctl(row_idx)
    {
        let ctl = document.createElement('div');
        ctl.className = 'pan_ctl';

        let slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'pan_slider';
        slider.min = MIN_PAN;
        slider.max = MAX_PAN;
        slider.step = 1;
        slider.value = pattern.pans[row_idx];

        let readout = document.createElement('span');
        readout.className = 'pan_val';

        // Say where the row sits, on the control and on the row as a whole: the
        // readout is small and a grid of them is easy to lose track of, so the
        // sample the position belongs to is named in the tooltip
        function show_pan(pan)
        {
            readout.textContent = pan_label(pan);
            slider.title = `Stereo position of ${
                get_sample_name(pattern.sample_idxs[row_idx])}: ${pan_label(pan)}`;
            update_slider_fill(slider);
        }

        slider.oninput = () =>
        {
            let pan = slider.valueAsNumber;
            pattern.set_row_pan(row_idx, pan);
            show_pan(pan);
        };

        // Double-clicking a mixer control puts it back where it started, which
        // is the only way to hit the centre exactly on a touch screen
        slider.ondblclick = () =>
        {
            slider.value = 0;
            pattern.set_row_pan(row_idx, 0);
            show_pan(0);
        };

        show_pan(pattern.pans[row_idx]);

        ctl.appendChild(slider);
        ctl.appendChild(readout);

        return ctl;
    }

    // Create a div representing one cell
    function make_cell(row_idx, step_idx)
    {
        // The outer cell div is the element reacting to clicks
        // It's larger and therefore easier to click
        let cell = document.createElement('div');
        cell.className = 'cell_box';

        // The inner div is the colored/highlighted element. The on/off classes
        // are toggled individually so that they compose with the `playing`
        // class the playback highlight adds.
        let inner = document.createElement('div');
        let cell_on = pattern.get_cell(row_idx, step_idx);
        inner.className = cell_on? 'cell on':'cell off';
        cell.appendChild(inner);

        cell.onclick = (evt) =>
        {
            let cell_on = pattern.toggle_cell(row_idx, step_idx);
            inner.classList.toggle('on', cell_on);
            inner.classList.toggle('off', !cell_on);

            evt.stopPropagation();
        };

        return cell;
    }

    // The grid is rebuilt, so nothing carries the highlight anymore
    cur_highlight = null;
    cell_divs = [];

    set_pat_color(pat_div, pat_idx);
    pat_div.replaceChildren();

    // One row of cells per sample
    for (let row_idx = 0; row_idx < pattern.num_rows; ++row_idx)
    {
        let row_div = document.createElement('div');
        row_div.className = 'pat_row';
        row_div.appendChild(make_sample_sel(row_idx));

        // The cells sit in their own div so that the beat separators, which are
        // spaced off the position of a cell within its parent, don't have to
        // account for the controls surrounding the cells
        let cells_div = document.createElement('div');
        cells_div.className = 'pat_cells';

        let row_cells = [];

        for (let step_idx = 0; step_idx < pattern.num_steps; ++step_idx)
        {
            let cell = make_cell(row_idx, step_idx);
            cells_div.appendChild(cell);
            row_cells.push(cell.firstElementChild);
        }

        cell_divs.push(row_cells);
        row_div.appendChild(cells_div);
        row_div.appendChild(make_pan_ctl(row_idx));
        pat_div.appendChild(row_div);
    }

    // A pattern that can't grow any further gets no button
    if (pattern.num_rows < MAX_PAT_ROWS)
        pat_div.appendChild(make_add_row());
}

//============================================================================
// Timeline
//
// The timeline has one lane per pattern, and one cell per playthrough of that
// pattern. Steps have a fixed duration, so a cell is drawn as wide as the
// pattern is long: a cell is that much time, whatever lane it sits on, and
// lanes of different lengths visibly phase against each other.
//============================================================================

// Width of one step of the timeline, in pixels
const STEP_PX = 6;

// How much room past the end of the song the timeline shows, and the smallest
// extent it shows, both in steps. The song ends at the last pattern placed on
// it, so there has to be somewhere past that end to place the next one.
const TRAILING_STEPS = 2 * STEPS_PER_BAR;
const MIN_VIEW_STEPS = 8 * STEPS_PER_BAR;

// Playhead of the last timeline render, and the offset the lanes start at,
// which is what the playhead is positioned against
let playhead_div = null;
let lanes_left = 0;

// Song step the timeline is currently showing the playhead at, null if none
let cur_song_step = null;

// Move the timeline playhead to the song step being played, or hide it when
// step_idx is null. Like the pattern grid highlight, this runs on every
// animation frame, so it only moves the playhead instead of redrawing lanes.
export function highlight_song_step(step_idx)
{
    if (step_idx === cur_song_step)
        return;

    if (playhead_div)
    {
        playhead_div.style.display = (step_idx === null)? 'none':'block';

        if (step_idx !== null)
            playhead_div.style.left = `${lanes_left + step_idx * STEP_PX}px`;
    }

    cur_song_step = step_idx;
}

// Generate the DOM for the timeline, i.e. the arrangement of patterns.
//
// Like the pattern tab strip, the timeline reports back which pattern was
// picked for editing, which is a property of the editing session rather than
// of the project.
export function render_timeline(seq_div, project, cur_pat, handlers)
{
    // Create the label of a lane, which names the pattern the lane places and
    // doubles as a way to open that pattern for editing
    function make_label(pat_idx)
    {
        let pat = project.patterns[pat_idx];

        let button = document.createElement('button');
        button.className = 'tl_label';
        button.textContent = pat_idx + 1;
        button.title = `Edit pattern ${pat_idx + 1} (${pat.num_steps} steps)`;

        if (pat_idx == cur_pat)
            button.classList.add('selected');

        button.onclick = () => handlers.select(pat_idx);

        return button;
    }

    // Create one cell of a lane, i.e. one playthrough of that pattern
    function make_cell(pat_idx, cell_idx)
    {
        let num_steps = project.patterns[pat_idx].num_steps;

        let cell = document.createElement('div');
        let cell_on = project.get_lane_cell(pat_idx, cell_idx);
        cell.className = cell_on? 'tl_cell on':'tl_cell off';

        // Cells are inset by a pixel on each side, so that a run of them reads
        // as several playthroughs rather than as one long block
        cell.style.width = `${num_steps * STEP_PX - 2}px`;

        cell.onclick = () => handlers.toggle(pat_idx, cell_idx);

        return cell;
    }

    // Create the lane placing a given pattern in the song
    function make_lane(pat_idx, view_steps)
    {
        let lane_div = document.createElement('div');
        lane_div.className = 'tl_lane';
        set_pat_color(lane_div, pat_idx);
        lane_div.appendChild(make_label(pat_idx));

        let cells_div = document.createElement('div');
        cells_div.className = 'tl_cells';

        // Enough cells to cover the extent shown. A pattern whose length isn't
        // a whole number of bars has its last cell reach past that extent,
        // which is the same thing that happens at the end of the song.
        let num_cells = Math.ceil(view_steps / project.patterns[pat_idx].num_steps);

        for (let cell_idx = 0; cell_idx < num_cells; ++cell_idx)
            cells_div.appendChild(make_cell(pat_idx, cell_idx));

        lane_div.appendChild(cells_div);

        return lane_div;
    }

    // Create the ruler above the lanes, numbering the bars of the song. Cells
    // line up with bars only when their pattern is a whole number of bars long,
    // so this is what tells you where you are in the song.
    function make_ruler(view_steps)
    {
        let lane_div = document.createElement('div');
        lane_div.className = 'tl_lane tl_ruler';

        // Empty space above the lane labels, to line the bars up with the cells
        let label_div = document.createElement('div');
        label_div.className = 'tl_label tl_no_label';
        lane_div.appendChild(label_div);

        let bars_div = document.createElement('div');
        bars_div.className = 'tl_cells';

        for (let bar_idx = 0; bar_idx < view_steps / STEPS_PER_BAR; ++bar_idx)
        {
            let bar_div = document.createElement('div');
            bar_div.className = 'tl_bar';
            bar_div.textContent = bar_idx + 1;
            bar_div.style.width = `${STEPS_PER_BAR * STEP_PX}px`;
            bars_div.appendChild(bar_div);
        }

        lane_div.appendChild(bars_div);

        return lane_div;
    }

    // Create the marker showing where the song loops back to its start
    function make_loop_marker(song_steps)
    {
        let marker = document.createElement('div');
        marker.className = 'tl_loop';
        marker.style.left = `${lanes_left + song_steps * STEP_PX}px`;
        marker.title = `The song loops back to the start after ${song_steps} steps`;

        return marker;
    }

    let song_steps = project.song_num_steps;

    // Extent shown, i.e. the song plus the room to make it longer
    let view_steps = Math.min(
        Math.max(song_steps + TRAILING_STEPS, MIN_VIEW_STEPS),
        MAX_SONG_STEPS
    );

    // The timeline is rebuilt, so nothing carries the playhead anymore
    playhead_div = null;
    cur_song_step = null;

    // The lanes sit in a wrapper of their own so that the playhead and the
    // loop marker, which span every lane, can be positioned against it
    let tl_div = document.createElement('div');
    tl_div.className = 'timeline';
    tl_div.appendChild(make_ruler(view_steps));

    for (let pat_idx = 0; pat_idx < project.num_patterns; ++pat_idx)
        tl_div.appendChild(make_lane(pat_idx, view_steps));

    seq_div.replaceChildren(tl_div);

    // Where the lanes start, i.e. how far the labels push them in. This is
    // measured rather than assumed, so that the playhead lines up with the
    // cells whatever the labels end up being sized at.
    lanes_left = tl_div.querySelector('.tl_cells').offsetLeft;

    // A song that plays nothing has no loop point to show
    if (song_steps > 0)
        tl_div.appendChild(make_loop_marker(song_steps));

    playhead_div = document.createElement('div');
    playhead_div.className = 'tl_playhead';
    playhead_div.style.display = 'none';
    tl_div.appendChild(playhead_div);
}
