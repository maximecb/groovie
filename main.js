import { SAMPLE_PATHS } from "./sample_list.js";
console.assert(SAMPLE_PATHS.length > 0);

// Play pattern button
let play_pat = document.getElementById('play_pat');

// Tempo in beats per minute
let tempo = 120;

// List of patterns
let patterns = Array(8);

// Currently selected pattern
let cur_pat = 0;






class Pattern
{
    initialize()
    {
        this.steps_per_bar = 16;
        this.num_bars = 1;
        this.num_steps = this.steps_per_bar * this.num_bars;

        // Initialize grid cells
        this.rows = [];
        for (let i = 0; i < 6; ++i)
        {
            this.rows[i] = Array(this.steps_per_bar * this.num_bars);
            this.rows[i].fill(0);
        }
    }
}




play_pat.onclick = function ()
{




}