import { SORTED_SAMPLE_IDXS, get_sample_name, fetch_sample } from "./audio.js";
import { MAX_PAT_ROWS } from "./model.js";

//============================================================================
// DOM rendering
//
// The views are a function of the model: rendering reads the project state and
// never stores state of its own. That's what makes it possible to drop in a
// project decoded from a URL and just re-render.
//============================================================================

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

// Generate the DOM for a pattern grid, replacing whatever the div held before
export function render_pattern(pat_div, pattern)
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

            // Load the newly selected sample so that it can be heard, whether
            // or not playback is currently running
            fetch_sample(sample_idx);
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
            render_pattern(pat_div, pattern);
        };

        row_div.appendChild(button);

        return row_div;
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
        pat_div.appendChild(row_div);
    }

    // A pattern that can't grow any further gets no button
    if (pattern.num_rows < MAX_PAT_ROWS)
        pat_div.appendChild(make_add_row());

    // TODO: stereo pan knob on the right of each row
}

// Generate the DOM for the timeline, i.e. the arrangement of patterns
export function render_timeline(seq_div, project)
{
    // TODO: one row per pattern, with each cell as wide as the pattern is long
    // in steps, and one cell representing one playthrough of that pattern.
    // This needs the timeline state in the model first (see design.md).
}
