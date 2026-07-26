//============================================================================
// DOM rendering
//
// The views are a function of the model: rendering reads the project state and
// never stores state of its own. That's what makes it possible to drop in a
// project decoded from a URL and just re-render.
//============================================================================

// Step column currently highlighted in the pattern grid, null if none
let cur_highlight = null;

// Highlight the step being played in the pattern grid, or clear the highlight
// when step_idx is null. This runs on every animation frame, so it only
// touches the two columns that change instead of rebuilding the grid.
export function highlight_step(pat_div, step_idx)
{
    if (step_idx === cur_highlight)
        return;

    for (let row_div of pat_div.children)
    {
        // A column may be gone if the pattern got shorter
        let old_cell = row_div.children[cur_highlight];
        if (old_cell)
            old_cell.children[0].classList.remove('playing');

        let new_cell = row_div.children[step_idx];
        if (new_cell)
            new_cell.children[0].classList.add('playing');
    }

    cur_highlight = step_idx;
}

// Generate the DOM for a pattern grid, replacing whatever the div held before
export function render_pattern(pat_div, pattern)
{
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

    pat_div.replaceChildren();

    // One row of cells per sample
    for (let row_idx = 0; row_idx < pattern.num_rows; ++row_idx)
    {
        let row_div = document.createElement('div');
        row_div.className = 'pat_row';

        for (let step_idx = 0; step_idx < pattern.num_steps; ++step_idx)
        {
            row_div.appendChild(make_cell(row_idx, step_idx));
        }

        pat_div.appendChild(row_div);
    }

    // TODO: sample selection drop-down on the left of each row
    // TODO: stereo pan knob on the right of each row
}

// Generate the DOM for the timeline, i.e. the arrangement of patterns
export function render_timeline(seq_div, project)
{
    // TODO: one row per pattern, with each cell as wide as the pattern is long
    // in steps, and one cell representing one playthrough of that pattern.
    // This needs the timeline state in the model first (see design.md).
}
