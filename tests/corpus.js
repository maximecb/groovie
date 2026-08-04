// The songs the encoding is exercised and measured on.
//
// These live apart from the tests because they are used for two things. The
// tests round-trip them and assert on their structure, and tools/link_sizes.js
// measures what they encode to. A change to the encoding is judged on what it
// does to this list, so a song is worth adding here whenever it is shaped
// differently from everything already in it, rather than whenever it sounds
// different.
//
// Patterns are written as one character per step, 'x' for a cell that plays
// and '.' for one that doesn't, so that a pattern reads as the grid the editor
// shows. Timeline lanes are written the same way, except that a lane cell is a
// whole playthrough of its own pattern rather than a step.
//
// Rows name the sample they play, so that the links these encode to open as
// the songs they are meant to be rather than as their grids over whatever
// samples happen to come first. That ties this file to the sample table: a
// sample removed from it takes the tests down with it, which is the price of
// the corpus being playable.
//
// A pattern can also give its rows stereo positions, in the tenths the model
// holds them in, from -10 for hard left to 10 for hard right, and levels, in
// the decibels it holds those in, from -30 for silence up to 0. A pattern that
// says nothing about either is played down the middle at full level, which is
// where a row starts out.
//
// Rows can be sent to the delay the same way, in the decibels a send is held
// in, and the song can say how the delay itself is set. A song that says
// nothing about either is played dry.
//
// A song can also say where the project's filter is left, signed either side
// of a centre where it does nothing, and how much it resonates there. One that
// says nothing about either is played unfiltered.

import { get_sample_idx } from "../audio.js";
import {
    Pattern,
    Project,
    MAX_SONG_STEPS,
    MIN_TEMPO,
    STEPS_PER_BAR,
} from "../model.js";

// How many bars the longest song there can be runs for
const MAX_SONG_BARS = MAX_SONG_STEPS / STEPS_PER_BAR;

// Read a row of steps written as 'x' for on and '.' for off
export function cells(str)
{
    return Array.from(str, ch => ch == 'x'? 1:0);
}

// Read a timeline lane written the same way. A lane never ends on an inactive
// cell, so the trailing off-cells that pad the grid out to a readable width
// are dropped, leaving the lane as toggle_lane_cell would have.
export function lane_cells(str)
{
    let lane = cells(str);

    while (lane.length > 0 && !lane[lane.length - 1])
        lane.pop();

    return lane;
}

// A lane that starts at a given bar and runs to the end of a song, in whole
// cells of a pattern of a given length. A cell is one playthrough, so a
// pattern whose length doesn't divide the song stops a little short of the end
// rather than being cut off mid-playthrough.
export function lane_from_bar(start_bar, num_steps, song_bars)
{
    let first_cell = Math.ceil(start_bar * STEPS_PER_BAR / num_steps);
    let last_cell = Math.floor(song_bars * STEPS_PER_BAR / num_steps) - 1;

    return [
        ...Array(first_cell).fill(0),
        ...Array(last_cell - first_cell + 1).fill(1),
    ];
}

// A lane placing a pattern over several stretches of a song, each written as
// the bar it comes in at and the bar it drops out before. Lanes are written
// out as grids wherever they fit on a line; this is for the ones that don't.
export function lane_over_bars(num_steps, song_bars, ranges)
{
    let lane = [];

    for (let [start_bar, end_bar] of ranges)
    {
        let first_cell = Math.ceil(start_bar * STEPS_PER_BAR / num_steps);
        let last_cell = Math.floor(end_bar * STEPS_PER_BAR / num_steps) - 1;

        while (lane.length < first_cell)
            lane.push(0);

        while (lane.length <= last_cell)
            lane.push(1);
    }

    return lane;
}

// A lane placing a pattern as one-off hits, each written as the cell it lands
// on. A one-shot is a pattern a fraction of a bar long, so its lane runs to
// hundreds of cells across a full song and reads as nothing at all written out
// as a grid, while the few cells that are on are the whole of what it says.
export function lane_at_cells(cell_idxs)
{
    let lane = [];

    for (let cell_idx of cell_idxs)
    {
        while (lane.length < cell_idx)
            lane.push(0);

        lane.push(1);
    }

    return lane;
}

// Every song says how many bars it runs for, which the tests check it still
// does. Songs are all sorts of lengths: a single pattern played once is as
// much a song as a 32 bar arrangement, and the encoding has to carry both.
export const CORPUS = [

{
    // A real pattern rather than a made-up one, and about as much as a single
    // pattern can hold: four bars at MAX_PAT_STEPS, four rows, most of them
    // busy. Note that this is the grid rendering of the break, not the break:
    // the original is played by a person and sits off the grid throughout.
    name: 'the amen break',
    tempo: 136,
    song_bars: 4,
    patterns: [
        {
            samples: ['crash_01', 'ride_01', 'snare_05', 'kick_01'],
            rows: [
                //  bar 1              bar 2              bar 3              bar 4
                'x...............' + '................' + '................' + '................',
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
                '....x..x..x.x...' + '....x..x..x.x...' + '....x.....x.x...' + '....x..x..x.....',
                'x.x.......xx....' + 'x.x.......xx....' + '..x........x....' + '..x.......xx....',
            ],
            lane: 'x',
        },
    ],
},

{
    // Written for this rather than lifted from a record. Four bars of two-step
    // at 174: kick and snare holding the two-step down, rimshots standing in
    // for ghost notes since a cell is on or off with nothing in between, and
    // the hats opening up into sixteenths for the last half bar.
    name: 'a drum and bass roller',
    tempo: 174,

    // Two playthroughs of a four bar pattern
    song_bars: 8,
    patterns: [
        {
            samples: [
                'crash_01',
                'hat_open_02',
                'hat_closed_02',
                'rimshot_01',
                'snare_distort_01',
                'kick_distort_01',
            ],
            rows: [
                //  bar 1              bar 2              bar 3              bar 4
                'x...............' + '................' + '................' + '................',
                '......x.........' + '......x.......x.' + '......x.........' + '......x.........',
                'x.x.x...x.x.x.x.' + 'x.x.x...x.x.x...' + 'x.x.x...x.x.x.x.' + 'x.x.x...xxxxxxxx',
                '..x......x.....x' + '..x....x.x......' + '..x...x....x....' + '..x..x..x..x....',
                '....x.......x...' + '....x.......x...' + '....x.......x...' + '....x.......x.x.',
                'x.........x.....' + 'x.........x..x..' + 'x.......x...x...' + 'x.........x.....',
            ],
            lane: 'xx',
        },
    ],
},

{
    // Boom bap at 90, four two-bar patterns tiling the arrangement between
    // them, with a three-bar shaker layer running across on top
    name: 'a 32 bar hip hop arrangement',
    tempo: 90,
    song_bars: 32,
    patterns: [
        {   // main groove
            samples: ['kick_03', 'snare_04', 'hat_closed_01', 'rimshot_02'],
            rows: [
                'x.........x.....' + 'x.....x...x.....',
                '....x.......x...' + '....x.......x...',
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
                '..............x.' + '..x...........x.',
            ],
            lane: '..xxxxx.xx..xxx.',
        },
        {   // turnaround, with the fill in its second bar
            samples: ['kick_03', 'snare_04', 'hat_closed_01', 'rimshot_02'],
            rows: [
                'x.........x.....' + 'x.........x.....',
                '....x.......x...' + '....x.......x.x.',
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.xxxxxx',
                '..............x.' + '..x.....x.x.x.x.',
            ],
            lane: '.......x...x...x',
        },
        {   // intro
            samples: ['kick_03', 'snare_04', 'hat_closed_01', 'rimshot_02'],
            rows: [
                '................' + 'x...............',
                '..............x.' + '................',
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
                '..x.......x.....' + '..x.......x.....',
            ],
            lane: 'xx..............',
        },
        {   // breakdown
            samples: ['kick_03', 'snare_04', 'hat_closed_01', 'rimshot_02'],
            rows: [
                'x...............' + 'x.......x.......',
                '............x...' + '....x...........',
                'x...x...x...x...' + 'x...x...x...x...',
                '..x...x...x...x.' + '..x...x...x...x.',
            ],
            lane: '..........x.....',
        },
        {   // three bars long, so it never lines up with the two-bar patterns
            samples: ['maracas_01', 'perc_01'],
            rows: [
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
                '..x..x..x..x..x.' + '..x..x..x..x..x.' + '..x..x..x..x....',
            ],
            lane: '.xxxxxxxxx',
        },
    ],
},

{
    // Four to the floor at 130, laid out the same way as the hip hop above:
    // two-bar patterns tiling the song, with a layer that doesn't divide the
    // bar running over them
    name: 'a 32 bar techno arrangement',
    tempo: 130,
    song_bars: 32,
    patterns: [
        {   // kick and hats only
            samples: ['kick_09', 'hat_closed_03'],
            rows: [
                'x...x...x...x...' + 'x...x...x...x...',
                '..x...x...x...x.' + '..x...x...x...x.',
            ],
            lane: 'xx..............',
        },
        {   // main
            samples: ['kick_09', 'clap_02', 'hat_closed_03', 'hat_open_03'],
            rows: [
                'x...x...x...x...' + 'x...x...x...x...',
                '....x.......x...' + '....x.......x...',
                '..x...x...x...x.' + '..x...x...x...x.',
                '......x.......x.' + '......x.......x.',
            ],
            lane: '..xxxx..xxxx....',
        },
        {   // build, hats closing up into sixteenths
            samples: ['kick_09', 'clap_02', 'hat_closed_03', 'hat_open_03'],
            rows: [
                'x...x...x...x...' + 'x...x...x...x...',
                '....x.......x...' + '....x...x...x.x.',
                '..x...x...x...x.' + '..x...x.xxxxxxxx',
                '......x.......x.' + '......x.......x.',
            ],
            lane: '......xx........',
        },
        {   // peak, open hat on every offbeat
            samples: ['kick_09', 'clap_02', 'hat_closed_03', 'hat_open_03', 'perc_04'],
            rows: [
                'x...x...x...x...' + 'x...x...x...x...',
                '....x.......x...' + '....x.......x...',
                '..x...x...x...x.' + '..x...x...x...x.',
                '..x...x...x...x.' + '..x...x...x...x.',
                'x..x..x..x..x...' + 'x..x..x..x..x...',
            ],
            lane: '............xxxx',
        },
        {   // seven steps, which divides neither the bar nor anything above,
            // so it walks around the grid for as long as it plays
            samples: ['zap_04'],
            rows: ['x..x...'],
            lane: '.'.repeat(18) + 'x'.repeat(55),
        },
    ],
},

{
    // House at 124, and the one arrangement here that layers rather than tiles.
    // The two above hand the song from one pattern to the next, so only one of
    // them plays at a time; this one runs a one bar kick and open hat
    // underneath everything and stacks the rest on top, which is how a song
    // built out of parts rather than out of sections comes out. Six patterns
    // sound at once over its fullest bars, and its lanes are long unbroken runs
    // instead of the short blocks the others have.
    //
    // It is also the longest song here at 64 bars, the one with the most
    // patterns, and the only one whose patterns come in three different
    // lengths, so its lanes hold cells of one, two and four bars alongside each
    // other. The arrangement is the ordinary one: eight bars of kick, layers
    // coming in one section at a time, a breakdown that drops the kick, a build
    // out of it, a full peak, and a strip back at the end.
    name: 'a 64 bar house arrangement',
    tempo: 124,
    song_bars: 64,
    patterns: [
        {   // the engine, one bar of it, under everything but the breakdown
            samples: ['kick_04', 'hat_open_01'],
            rows: [
                'x...x...x...x...',
                '..x...x...x...x.',
            ],
            lane: 'x'.repeat(32) + '....' + 'x'.repeat(28),
        },
        {   // hats, with a pickup into the repeat
            samples: ['hat_closed_01', 'rimshot_04'],
            rows: [
                '.x.x.x.x.x.x.x.x' + '.x.x.x.x.x.xxx.x',
                '......x.........' + '......x.....x...',
            ],
            lane: '....xxxxxxxxxxxx' + '....xxxxxxxxxxxx',
        },
        {   // the backbeat, and the first thing that says where bar 2 is
            samples: ['clap_01', 'perc_01'],
            rows: [
                '....x.......x...' + '....x.......x..x',
                '..........x.....' + '..........x.x...',
            ],
            lane: '........xxxxxxxx' + '....xxxxxxxxxxxx',
        },
        {   // shaker running three against the four of everything else
            samples: ['maracas_01', 'bongo_02'],
            rows: [
                'x..x..x..x..x..x' + 'x..x..x..x..x..x',
                '......x.....x...' + '......x...x.....',
            ],
            lane: '............xxxx' + '........xxxxxxxx',
        },
        {   // four bars long, so it turns over once every four of the two bar
            // patterns and lands its tom fill on the bar a section ends
            samples: ['cowbell_01', 'perc_02', 'tom_low_01'],
            rows: [
                '....x..x....x..x' + '....x..x....x..x' + '....x..x....x..x' + '....x..x........',
                '..........x.....' + '..........x.....' + '..........x.....' + '..x...x...x.x...',
                '................' + '................' + '................' + '........x.x.x.x.',
            ],
            lane: '.......x' + '.....x.x',
        },
        {   // the breakdown, and the only bars with no kick under them
            samples: ['crash_01', 'clap_01', 'hat_open_01'],
            rows: [
                'x...............' + '................',
                '....x.......x...' + '....x.......x...',
                '..x...x...x...x.' + '..x...x...x...x.',
            ],
            lane: '.'.repeat(16) + 'xx',
        },
        {   // the build back out of it, the snare tightening up as it goes
            samples: ['snare_05', 'hat_closed_01', 'tom_mid_01'],
            rows: [
                '....x.......x...' + '..x.x.x.xxxxxxxx',
                'x.x.x.x.x.x.x.x.' + 'xxxxxxxxxxxxxxxx',
                '................' + '....x...x...x.x.',
            ],
            lane: '.'.repeat(18) + 'xx',
        },
        {   // the top of the peak, over the four patterns already running
            samples: ['claves_01', 'cowbell_02', 'zap_02'],
            rows: [
                '..x.......x.....' + '..x.......x.....' + '..x.......x.....' + '..x...x...x.x...',
                '............x...' + '............x...' + '............x...' + '....x.......x...',
                '................' + '................' + '................' + '..............x.',
            ],
            lane: '.'.repeat(10) + 'xxxx',
        },
    ],
},

{
    // The free-running polymeter the timeline is built around. Four layers
    // whose lengths are primes, over a plain 16 step pulse to hear them
    // against, each coming in a few bars after the last.
    //
    // The lanes are computed rather than drawn: they run from the bar the layer
    // comes in at to the end of the song, and a lane of 13 step cells written
    // out by hand would be unreadable.
    name: 'patterns of prime lengths',
    tempo: 120,
    song_bars: 32,
    patterns: [
        {
            samples: ['kick_02', 'hat_closed_04'],
            rows: ['x.......x.......', '..x...x...x...x.'],
            start_bar: 0,
        },
        { samples: ['rimshot_03'], rows: ['x..x.'],         start_bar: 4  },
        { samples: ['claves_01'],  rows: ['x..x...'],       start_bar: 8  },
        { samples: ['bongo_01'],   rows: ['x...x..x...'],   start_bar: 12 },
        { samples: ['tom_low_02'], rows: ['x.....x.x....'], start_bar: 16 },
    ].map(({ samples, rows, start_bar }) => ({
        samples: samples,
        rows: rows,
        lane: lane_from_bar(start_bar, rows[0].length, 32),
    })),
},

{
    // What a first-time user ends up with, which every other song here is the
    // opposite of. The default kit is taken as it comes and the rows that
    // weren't wanted are left sitting there empty rather than removed, since
    // the editor has no way to remove one. Three patterns that are edits of
    // one another, none of them ever playing a sample other than the one its
    // row was handed.
    //
    // The other songs are all custom kits with every row in use, so this is
    // the one that says what empty rows and an untouched kit cost. Two of its
    // rows are never played at all and a third is played by a single pattern.
    name: 'a default kit barely touched',
    tempo: 120,
    song_bars: 8,
    patterns: [
        {   // the beat
            samples: [
                'kick_01',
                'snare_01',
                'hat_closed_01',
                'hat_open_01',
                'clap_01',
                'rimshot_01',
            ],
            rows: [
                'x.......x.......',
                '....x.......x...',
                'x.x.x.x.x.x.x.x.',
                '................',
                '................',
                '................',
            ],
            lane: 'xx..xx..',
        },
        {   // the same beat with a clap over it and a kick pushed late
            samples: [
                'kick_01',
                'snare_01',
                'hat_closed_01',
                'hat_open_01',
                'clap_01',
                'rimshot_01',
            ],
            rows: [
                'x.......x...x...',
                '....x.......x...',
                'x.x.x.x.x.x.x.x.',
                '................',
                '....x.......x...',
                '................',
            ],
            lane: '..xx..x.',
        },
        {   // a fill to end on
            samples: [
                'kick_01',
                'snare_01',
                'hat_closed_01',
                'hat_open_01',
                'clap_01',
                'rimshot_01',
            ],
            rows: [
                'x.......x.......',
                '....x.......x.xx',
                'x.x.x.x.x.xxxxxx',
                '................',
                '................',
                '................',
            ],
            lane: '.......x',
        },
    ],
},

{
    // The only song here that pans anything, and so the one that says what
    // panning costs a link. Deep house at 124: a kit held down the middle with
    // the hats opened out either side of it, and a pair of bongo rows playing
    // the same drum against itself from opposite sides of the field, which is
    // what the two rows on one sample are for. The turnaround is three toms
    // laid left to right, so the fill crosses the field as it falls.
    //
    // The breakdown drops the kick by emptying its row rather than removing
    // it, which is what dropping a part looks like in the editor. That shifts
    // every row of that pattern up one once the empty row is stripped out, so
    // this is also the song that shows what a link pays when a pattern stops
    // lining up with the one before it.
    //
    // It is the only song here that swings, house having been made on machines
    // with a shuffle control since the beginning. The setting is a light one,
    // in the range those machines are usually left at: swing holds back the
    // odd steps, so all it reaches here is the syncopated sixteenths of the
    // bongos and one late clap, and the four to the floor underneath them
    // stays where it was.
    name: 'a 32 bar house groove panned wide',
    tempo: 124,
    swing: 56,
    song_bars: 32,
    patterns: [
        {   // the groove
            samples: [
                'kick_04',
                'clap_01',
                'hat_closed_01',
                'hat_open_01',
                'bongo_01',
                'bongo_01',
            ],
            rows: [
                //  bar 1              bar 2
                'x...x...x...x...' + 'x...x...x...x...',
                '....x.......x...' + '....x.......x...',
                '..x...x...x...x.' + '..x...x...x...x.',
                '......x.......x.' + '......x.......x.',
                'x..x......x.....' + 'x..x......x.....',
                '......x.....x..x' + '......x.....x..x',
            ],
            pans: [0, 0, 2, -3, -9, 9],
            lane: 'xxxx........xxxx',
        },
        {   // the same groove opened up, with a shaker across the top right
            samples: [
                'kick_04',
                'clap_01',
                'hat_closed_01',
                'hat_open_01',
                'bongo_01',
                'bongo_01',
                'maracas_01',
            ],
            rows: [
                //  bar 1              bar 2
                'x...x...x...x...' + 'x...x...x...x...',
                '....x.......x...' + '....x.......x..x',
                '..x...x...x...x.' + '..x...x...x.x.x.',
                '......x.......x.' + '......x.......x.',
                'x..x......x.....' + 'x..x......x.....',
                '......x.....x..x' + '......x.....x..x',
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
            ],
            pans: [0, 0, 2, -3, -9, 9, 5],
            lane: '....xxxx........',
        },
        {   // the breakdown, the kick emptied out rather than taken away
            samples: [
                'kick_04',
                'clap_01',
                'hat_closed_01',
                'hat_open_01',
                'bongo_01',
                'bongo_01',
            ],
            rows: [
                //  bar 1              bar 2
                '................' + '................',
                '....x.......x...' + '....x.......x...',
                '..x...x...x...x.' + '..x...x...x...x.',
                '......x.......x.' + '......x.......x.',
                'x..x......x.....' + 'x..x..x...x.....',
                '......x.....x..x' + '......x.....x..x',
            ],
            pans: [0, 0, 2, -3, -9, 9],
            lane: '........xxx.....',
        },
        {   // the turnaround, falling from left to right across the toms
            samples: ['tom_low_01', 'tom_mid_01', 'tom_hi_01', 'clap_01'],
            rows: [
                'x.......x.......',
                '..x.......x.....',
                '....x.......x...',
                '..............x.',
            ],
            pans: [-8, 0, 8, 0],
            lane: '......................xx........',
        },
    ],
},

{
    // The one song here that is mixed rather than just placed: every row sits
    // at a level of its own, which no other song sets at all. Psytrance at 145,
    // where the kick and the bass under it hold the middle at full level and
    // everything else is pulled down and pushed out to the sides around them.
    //
    // The engine is the rolling sixteenth bass answering the kick, which the
    // whole genre is built on: kick, rest, bass, bass, four times a bar. The
    // blips are one sample on two rows, the second a step behind the first and
    // quieter, which is a stereo delay written out as two rows.
    //
    // It is also the longest arrangement here, and the only one carrying a
    // layer whose length doesn't divide the bar: the twelve step percussion
    // runs from the first drop to the end, coming back into line with the bar
    // every three of them.
    name: 'a 64 bar psytrance arrangement',
    tempo: 145,
    song_bars: 64,
    patterns: [
        {   // the engine
            samples: [
                'kick_05',
                'kick_12',
                'hat_open_03',
                'hat_closed_03',
                'rimshot_03',
                'maracas_02',
            ],
            rows: [
                'x...x...x...x...',
                '..xx..xx..xx..xx',
                '..x...x...x...x.',
                '.x.x.x.x.x.x.x.x',
                '............x...',
                '...x...x...x...x',
            ],
            pans:    [0, 0, -2,   3,  -6,   5],
            volumes: [0, -3, -8, -12, -10, -14],
            lane: 'xxxxxxxx',
        },
        {   // the same, with a blip echoing across the field
            samples: [
                'kick_05',
                'kick_12',
                'hat_open_03',
                'hat_closed_03',
                'rimshot_03',
                'maracas_02',
                'zap_04',
                'zap_04',
            ],
            rows: [
                'x...x...x...x...',
                '..xx..xx..xx..xx',
                '..x...x...x...x.',
                '.x.x.x.x.x.x.x.x',
                '............x...',
                '...x...x...x...x',
                '....x.......x...',
                '......x.......x.',
            ],
            pans:    [0, 0, -2,   3,  -6,   5,  -9,   9],
            volumes: [0, -3, -8, -12, -10, -14, -13, -16],
            lane: '........' + 'xxxxxxxx' + '........' + 'xxxxxxxx' +
                  '........' + '........' + '....xxxx' + 'xxxxxxxx',
        },
        {   // the roll, the bass filling out and the toms coming over the top
            samples: [
                'kick_05',
                'kick_12',
                'hat_open_03',
                'hat_closed_03',
                'rimshot_03',
                'maracas_02',
                'tom_mid_04',
                'bongo_03',
            ],
            rows: [
                'x...x...x...x...',
                '..xx..xx..xx.xxx',
                '..x...x...x...x.',
                '.x.x.x.x.x.x.x.x',
                '............x...',
                '...x...x...x...x',
                '...........x.x..',
                'x..x..x..x..x..x',
            ],
            pans:    [0, 0, -2,   3,  -6,   5,  -4,   7],
            volumes: [0, -3, -8, -12, -10, -14,  -9, -12],
            lane: '........' + '........' + 'xxxxxxxx' + '........' +
                  '........' + '....xxxx' + 'xxxx....' + '........',
        },
        {   // the breakdown: the engine gone, and a different kit left running
            //  quietly and wide
            samples: [
                'ride_02',
                'claves_02',
                'bongo_03',
                'perc_03',
                'crash_01',
            ],
            rows: [
                //  bar 1              bar 2
                'x.......x.......' + 'x.......x.......',
                '..x.......x...x.' + '..x.......x.....',
                '....x.......x...' + '....x.....x.....',
                '..............x.' + '..........x.....',
                'x...............' + '................',
            ],
            pans:    [  0,  -8,   8,  -5,  0],
            volumes: [-10, -12, -12, -14, -6],
            lane: '........' + '........' + 'xxxx....' + '........',
        },
        {   // the build back into it
            samples: ['snare_distort_01', 'hat_closed_03', 'clap_03'],
            rows: [
                'x...x...x.x.x.xx',
                '.x.x.x.x.x.x.x.x',
                '............x.x.',
            ],
            pans:    [ 0,   3,  0],
            volumes: [-6, -12, -8],
            lane: '........' + '........' + '........' + '........' +
                  '........' + 'xxxx....',
        },
        {   // twelve steps against the bar, running from the first drop to the
            // end and landing back on the beat every three bars
            samples: ['cowbell_02', 'claves_02'],
            rows: [
                'x....x....x.',
                '..x..x..x...',
            ],
            pans:    [ -7,   7],
            volumes: [-16, -16],
            lane: lane_from_bar(16, 12, 64),
        },
    ],
},

{
    // Dub techno at 124, and the one song here built around the delay rather
    // than merely using it. The delay is set to three steps, the dotted eighth
    // that walks against a sixteenth grid, and fed back far enough that a hit
    // is still audible three or four repeats later, which is what fills the
    // space this arrangement deliberately leaves empty.
    //
    // What that pins for the encoding is a project whose delay is off its
    // defaults and whose rows are sent to it by differing amounts, including
    // rows sent the same way across patterns, which is the guess a send costs
    // a single bit when it is right. The rimshot and the stab are what get the
    // echoes; the kick and the hats stay dry, the way they would on a desk,
    // since a kick fed to a delay this long only turns the low end to mud.
    name: 'a dub techno arrangement',
    tempo: 124,
    delay_time: 19,         // three steps, i.e. a dotted eighth
    delay_feedback: 60,
    song_bars: 32,
    patterns: [
        {   // the four to the floor the rest is heard against
            samples: ['kick_04', 'hat_closed_02', 'clap_01'],
            rows: [
                'x...x...x...x...',
                '..x...x...x...x.',
                '....x.......x...',
            ],
            pans:    [ 0, -4,  2],
            volumes: [ 0, -9, -6],
            lane: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        },
        {   // the rimshot the delay is really for, on the off-beats
            samples: ['rimshot_01'],
            rows: ['..x.......x....x'],
            pans:    [ 5],
            volumes: [-8],
            sends:   [-6],
            lane: '....xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        },
        {   // a metallic stab, sent harder and played sparsely so the repeats
            // have room to be heard on their own
            samples: ['metal_01', 'claves_01'],
            rows: [
                '............x...',
                '......x.........',
            ],
            pans:    [ -6,  6],
            volumes: [-12, -14],
            sends:   [ -3, -12],
            lane: '........xxxxxxxx....xxxxxxxxxxxx',
        },
        {   // the same stab row sent the same way, which is what a send costs
            // a single bit to say
            samples: ['metal_01', 'perc_02'],
            rows: [
                '........x.......',
                '..x..x..........',
            ],
            pans:    [ -6,  7],
            volumes: [-12, -15],
            sends:   [ -3, -18],
            lane: '................xxxxxxxx........',
        },
    ],
},

{
    // Two step garage at 136, which is here for a combination nothing else has:
    // it is the only song that swings and echoes at once. Swing moves when a
    // step is heard without moving the grid the steps are counted on, and the
    // delay is set against that grid, so the echoes land straight while the
    // pattern above them shuffles. That is what a delay synced to a drum
    // machine's clock has always done, and this is the song that would notice
    // if it stopped.
    //
    // The delay is set to three steps, the dotted eighth: it doesn't divide the
    // bar, so an echo lands three steps after whatever started it and crosses
    // the four-square grid rather than doubling it. About 331ms at this tempo,
    // which is long enough for a repeat to read as an answer to the hit rather
    // than as part of it.
    //
    // Every row is placed across the stereo field and all but the kicks are
    // sent to the delay, by amounts that change between the two core patterns
    // while their panning and levels don't. That is the case worth having here:
    // a pattern whose rows are guessed right in two fields and wrong in the
    // third, which is what a variation actually looks like.
    name: 'a 32 bar two step arrangement',
    tempo: 136,
    swing: 62,
    delay_time: 19,         // three steps, i.e. a dotted eighth
    delay_feedback: 35,
    song_bars: 32,
    patterns: [
        {   // the two step itself: kick off the downbeat, snare on 2 and 4
            samples: ['kick_09', 'snare_08', 'hat_closed_04', 'rimshot_03'],
            rows: [
                'x.........x.....' + 'x.....x.........',
                '....x.......x...' + '....x.......x...',
                '..x...x...x...x.' + '..x...x...x...x.',
                '...........x....' + '......x....x..x.',
            ],
            pans:    [  0,  -2,   6,  -7],
            volumes: [  0,  -3, -10, -13],
            sends:   [-30, -15, -22,  -7],
            lane: 'xxxxxxxx....xxxx',
        },
        {   // the same kit busier, for the middle of the arrangement. The
            // panning and levels are untouched, so those cost a bit a row.
            samples: ['kick_09', 'snare_08', 'hat_closed_04', 'rimshot_03'],
            rows: [
                'x.........x.....' + 'x.....x...x.....',
                '....x.......x...' + '....x.......x.x.',
                '..x...x...x...x.' + '..x.x.x...x.x.x.',
                '......x....x....' + '...x..x....x..x.',
            ],
            pans:    [  0,  -2,   6,  -7],
            volumes: [  0,  -3, -10, -13],
            sends:   [-30, -10, -22,  -4],
            lane: '........xxxx',
        },
        {   // three bars of percussion walking against the two bar patterns
            samples: ['maracas_02', 'bongo_02', 'claves_02'],
            rows: [
                '..x..x..x..x..x.' + '..x..x..x..x..x.' + '..x..x..x.x.x.x.',
                '.....x......x...' + '.....x..x...x...' + '.....x......x.x.',
                '..........x.....' + '................' + '..........x..x..',
            ],
            pans:    [ -9,   8,  -5],
            volumes: [-14, -11, -17],
            sends:   [-24, -12,  -6],
            lane: '..xxxxxxxx',
        },
        {   // stabs, sent hardest of anything here and played sparsely so the
            // repeats have room to walk before the next one lands on them
            samples: ['vocal_what_02', 'zap_03'],
            rows: [
                'x...............' + '................' + '............x...' + '................',
                '................' + '..........x.....' + '................' + '......x.....x...',
            ],
            pans:    [  4, -10],
            volumes: [ -8, -13],
            sends:   [ -4,  -2],
            lane: '..xx..xx',
        },
    ],
},

{
    // Drill and bass at 165, and the song here the encoding has the least
    // purchase on. Nothing in it is arranged to defeat the encoder: this is
    // what the genre is, and every one of the things that costs it space is
    // something the music is actually doing.
    //
    // A break is chopped so that no bar of it lands the same way twice, which
    // is the whole point of the style and also exactly what the group schemes
    // look for and don't find. The layers over it run 20, 24, 28, 40 and 48
    // steps, none of them a multiple of the 8 and 16 those schemes work in and
    // none of them a length a motif repeats at, so most rows here end up
    // written out flat. The kit changes between the two break patterns, and so
    // do the levels, panning and sends, so a row is guessed wrong in nearly
    // every field rather than in one of them. The sections cut against each
    // other rather than running in long blocks, which is what a lane written as
    // runs of cells is least happy with.
    //
    // Against the house arrangement, which is the other eight pattern song of
    // sixty four bars here: a grid 22% larger that encodes 77% larger, 980
    // cells into 228 bytes against 800 into 129. That is 1.9 bits spent per
    // cell of grid where the house song spends 1.3, and it is the measurement
    // this song is here to keep taking. A scheme that helps the songs above
    // and leaves this one where it is has found the easy half of the problem.
    name: 'a 64 bar drill and bass arrangement',
    tempo: 165,
    delay_time: 9,          // five quarters of a step, about 114ms here
    delay_feedback: 45,
    song_bars: 64,
    patterns: [
        {   // the break, four bars of it with no two the same
            samples: ['kick_02', 'snare_03', 'hat_closed_03', 'rimshot_02'],
            rows: [
                'x.x.......x.....' + 'x.........x...x.' + 'x.x.....x.......' + 'x.......x.x...x.',
                '....x.......x..x' + '....x.....x.x...' + '....x..x....x...' + '..x.x.......x.xx',
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.xxx.x.' + 'x.x.x.xxx.x.x.x.' + 'x.xxx.x.xxx.xxxx',
                '..x..x...x..x...' + '...x...x..x...x.' + '..x...x..x..x..x' + '.x..x..x.x..x...',
            ],
            pans:    [  0,  -1,   4,  -6],
            volumes: [  0,  -2, -11, -14],
            sends:   [-30, -18, -26,  -9],
            lane: 'xxxx..xxxx..xxxx',
        },
        {   // the break again on a harder snare, everything about it moved
            samples: ['kick_02', 'snare_distort_01', 'hat_closed_03', 'rimshot_02'],
            rows: [
                'x.......x.x.....' + 'x.x.......x.....' + 'x.....x...x..x..' + 'x.x...x.....x...',
                '....x.......x...' + '....x..x..x.x..x' + '....x.......x.x.' + '....x.x...x.x.xx',
                'x.xxx.x.x.x.x.x.' + 'x.x.x.xxx.x.x.xx' + 'x.x.x.x.xxx.x.x.' + 'xxx.x.x.x.xxxxx.',
                '...x..x..x...x..' + '..x..x...x..x..x' + '.x..x..x..x..x..' + '..x..x.x..x.x...',
            ],
            pans:    [  0,   2,  -5,   7],
            volumes: [  0,  -3, -12, -13],
            sends:   [-30, -12, -24,  -6],
            lane: '....xx....xx',
        },
        {   // three bars of sub, walking against the four bar break
            samples: ['kick_distort_02', 'tom_low_01'],
            rows: [
                'x.......x.......' + '....x.......x...' + 'x.....x.....x...',
                '..........x.....' + '..............x.' + '........x.......',
            ],
            pans:    [  0,  -8],
            volumes: [ -2, -12],
            sends:   [-30, -14],
            lane: '..xxxxxxxxxxxxxxxxxx',
        },
        {   // twenty steps of metallic hat, which is a length nothing here
            // divides and no motif repeats at
            samples: ['hat_metal_01', 'zap_01'],
            rows: [
                'x.x.xx.x.x.xx.x.x.x.',
                '....x.......x.....x.',
            ],
            pans:    [  9,  -9],
            volumes: [-13, -16],
            sends:   [ -8,  -5],
            lane: lane_over_bars(20, 64, [[12, 24], [44, 58]]),
        },
        {   // percussion in sevens, the shaker running in threes across it
            samples: ['bongo_03', 'claves_01', 'maracas_01'],
            rows: [
                '..x...x..x...x..x..x..x...x.',
                '....x.......x.....x.....x...',
                'x..x..x..x..x..x..x..x..x..x',
            ],
            pans:    [ -7,   6,  -4],
            volumes: [-15, -14, -18],
            sends:   [-16, -10, -22],
            lane: lane_over_bars(28, 64, [[8, 20], [36, 52]]),
        },
        {   // the rolls that end a section, dense enough that the row is
            // cheaper written out than described
            samples: ['snare_11', 'tom_hi_02', 'clap_03'],
            rows: [
                '..x.x.xxx.x.xxxx' + 'x.xxxxx.xxxxxxxx',
                'x.....x...x.....' + '..x...x.x...x.x.',
                '............x...' + '..............xx',
            ],
            pans:    [  3,  -6,   8],
            volumes: [ -6, -12,  -9],
            sends:   [-11, -20,  -7],
            lane: lane_over_bars(32, 64, [[14, 16], [22, 24], [38, 40], [46, 48], [62, 64]]),
        },
        {   // forty steps of atmosphere, sent hardest of anything here
            samples: ['twang_02', 'beep_01'],
            rows: [
                'x.............................x.........',
                '..............x.....................x...',
            ],
            pans:    [-10,   9],
            volumes: [-14, -17],
            sends:   [ -3,  -2],
            lane: lane_over_bars(40, 64, [[16, 32], [48, 60]]),
        },
        {   // the breakdown, on a kit of its own and in bars of a bar and a half
            samples: ['kick_11', 'rimshot_04', 'hat_open_03'],
            rows: [
                'x.......x.......x.......',
                '....x.......x.......x..x',
                '..x...x...x...x...x...x.',
            ],
            pans:    [  0,   5,  -6],
            volumes: [ -4, -13, -11],
            sends:   [-30,  -9, -15],
            lane: lane_over_bars(24, 64, [[26, 34]]),
        },
    ],
},

{
    // Rave at 138, and the only song here built the way a sampler is played:
    // half of its twelve patterns are single hits, a four step pattern holding
    // one vocal or one alarm, dropped onto the timeline where that hit lands.
    // The layers underneath are ordinary two bar patterns.
    //
    // That is what this pins, and nothing else here comes near it. A one-shot
    // lane is 200 cells and more of which four or five are on, sitting alone
    // rather than in runs, which is the shape a lane written as runs of cells
    // is worst at: every hit costs a run of its own plus the silence before it.
    // The song is also 60 bars long, which is not a power of two and not a
    // length any of its patterns divides, so the timeline ends part-way through
    // a cell of most lanes rather than on a boundary they share.
    //
    // The kick is doubled: a four to the floor with a second kick on the three
    // sixteenths between each beat, which is the drive the whole thing runs on.
    // Almost everything is placed by level rather than across the stereo field,
    // only the bongos being panned at all, and the sends are spent on the
    // one-shots, so a hit answers itself across the bar.
    name: 'a 60 bar rave with vocal one shots',
    tempo: 138,
    delay_time: 19,         // three steps, i.e. a dotted eighth
    delay_feedback: 35,
    song_bars: 60,
    patterns: [
        {   // the doubled kick and the offbeat hat everything else sits on
            samples: ['kick_01', 'kick_06', 'hat_closed_04'],
            rows: [
                'x...x...x...x...' + 'x...x...x...x...',
                '.xxx.xxx.xxx.xxx' + '.xxx.xxx.xxx.xxx',
                '..x...x...x...x.' + '..x...x...x...x.',
            ],
            volumes: [  0, -19,  -4],
            lane: 'xxxxxxxxxxxx....xxxxxxx.xxxx',
        },
        {   // a formant blip on the offbeats, sent so it smears
            samples: ['formant_01'],
            rows: [
                '..x.......x.....' + '..x.......x.....',
            ],
            volumes: [-12],
            sends:   [-26],
            lane: '....xxxxxxxx....xxxxxxxxxxxxx',
        },
        {   // shakers, the busiest thing here and the quietest
            samples: ['maracas_01', 'maracas_02'],
            rows: [
                '.x...x...x...xx.' + '...x..x....x..x.',
                'x.xxx.xxx.xxx..x' + '.xx.xx.x.xx.xx..',
            ],
            volumes: [ -4, -14],
            lane: '........xxxx........xxxxxxxxx',
        },
        {   // sixteenths straight through, for the lifts
            samples: ['hat_closed_05'],
            rows: [
                'xxxxxxxxxxxxxxxx' + 'xxxxxxxxxxxxxxxx',
            ],
            volumes: [-11],
            lane: '............xxxx.......x....x',
        },
        {   // a second kick layered over the first through those same bars
            samples: ['kick_07'],
            rows: [
                'x...x...x...x...' + 'x...x...x...x...',
            ],
            sends:   [-13],
            lane: '............xxxx.......x....x',
        },
        {   // the one-shots: a four step pattern holding a single hit, placed
            // by the cells it lands on. Four steps is a quarter of a bar, so
            // cell 32 is bar 8.
            samples: ['vocal_what_02'],
            rows: [
                '.x..',
            ],
            sends:   [-16],
            lane: lane_at_cells([32, 144, 200]),
        },
        {
            samples: ['vocal_scream_01'],
            rows: [
                '.x..',
            ],
            sends:   [ -8],
            lane: lane_at_cells([48, 136, 172, 212]),
        },
        {
            samples: ['vocal_gasp'],
            rows: [
                '.x..',
            ],
            sends:   [-17],
            lane: lane_at_cells([64, 184, 206]),
        },
        {
            samples: ['alarm_01'],
            rows: [
                'x...',
            ],
            sends:   [-13],
            lane: lane_at_cells([96, 232]),
        },
        {   // four bars of bongos, the only rows placed off centre
            samples: ['bongo_01', 'bongo_02', 'bongo_03', 'bongo_04'],
            rows: [
                '....xxx..xx.....' + '......x..xx.....' + '....xxx..xx.....' + '.x...x..........',
                '.......x........' + '.......x........' + '.......x........' + '..x.............',
                '................' + '..........x.....' + '................' + '.........x..x...',
                '................' + '...........x....' + '................' + '.......x.....x..',
            ],
            pans:    [  0,   0,  -8,   8],
            sends:   [-21, -16, -17, -21],
            lane: '......xxxx..xx',
        },
        {   // the hook the song is named after, landing every eight bars and
            // once more on the last cell of the timeline
            samples: ['vocal_come_on_01'],
            rows: [
                'x...',
            ],
            volumes: [ -3],
            lane: lane_at_cells([128, 160, 192, 224, 239]),
        },
        {   // open hats through the last third, over the busiest of it
            samples: ['hat_open_04'],
            rows: [
                '..x...x...x...x.' + '..x...x...x...x.',
            ],
            volumes: [-11],
            lane: '....................xxxxxxxx',
        },
    ],
},

{
    // The longest a song can be: the timeline filled to MAX_SONG_STEPS and
    // played at the slowest tempo a project can be set to, which comes to 1024
    // bars and a little over an hour and a half. It is here for what that
    // costs rather than for what it plays. A lane is written as runs of cells
    // rather than as the cells themselves (see encode_lane), so length is very
    // nearly free, and nothing else here reaches the end of the range where a
    // run takes several chunks to write and a lane holds a couple of thousand
    // cells: this whole song is 99 bytes, against 142 for the psytrance one.
    //
    // What keeps an hour and a half from being one bar heard 1024 times is
    // that the pattern lengths are pairwise coprime, so no two layers ever
    // line up the same way twice. Only the first pattern sits square on the
    // bar; every other one walks against it, and the arrangement is the layers
    // coming in one at a time over the first 320 bars with a few of them
    // dropping out later. The whole thing would come back to where it started
    // after 1,784,742,960 steps, which at this tempo is 21 years.
    name: 'the longest song there can be',
    tempo: 137,
    song_bars: MAX_SONG_BARS,
    patterns: [
        {   // The pulse, and the one layer the others are heard against
            samples: ['kick_01', 'snare_01'],
            rows: [
                'x...x...x...x...',
                '....x.......x...',
            ],
            lane: lane_over_bars(16, MAX_SONG_BARS,
                [[0, 512], [576, 832], [864, MAX_SONG_BARS]]),
        },
        {   // A step short of the bar, so it walks backwards through it
            samples: ['hat_closed_01', 'maracas_01'],
            rows: [
                'x.x.x.x.x.x.x.x',
                '..x...x...x...x',
            ],
            pans:    [-3,   7],
            volumes: [-6, -11],
            lane: lane_over_bars(15, MAX_SONG_BARS, [[4, 512], [544, MAX_SONG_BARS]]),
        },
        {
            samples: ['hat_open_01'],
            rows: ['......x......'],
            pans: [4],
            volumes: [-9],
            lane: lane_over_bars(13, MAX_SONG_BARS, [[16, MAX_SONG_BARS]]),
        },
        {
            samples: ['clap_01'],
            rows: ['..x.....x..'],
            pans: [6],
            volumes: [-6],
            lane: lane_over_bars(11, MAX_SONG_BARS, [[32, MAX_SONG_BARS]]),
        },
        {
            samples: ['rimshot_01', 'cowbell_01'],
            rows: [
                'x...x.x...x.x....',
                '........x........',
            ],
            pans:    [-6,   2],
            volumes: [-8, -14],
            lane: lane_over_bars(17, MAX_SONG_BARS, [[64, MAX_SONG_BARS]]),
        },
        {   // The shortest layer, and the only one that drops out for the
            // whole of the breakdown rather than part of it
            samples: ['tom_low_01'],
            rows: ['x......'],
            volumes: [-12],
            lane: lane_over_bars(7, MAX_SONG_BARS, [[128, 512], [640, MAX_SONG_BARS]]),
        },
        {   // The two longest cycles are the pitched ones, so that what little
            // of the song is not percussion turns over slowest of all
            samples: ['twang_01'],
            rows: ['..........x........'],
            pans: [-8],
            volumes: [-13],
            lane: lane_over_bars(19, MAX_SONG_BARS, [[192, MAX_SONG_BARS]]),
        },
        {
            samples: ['glass_01'],
            rows: ['x..............x.......'],
            pans: [9],
            volumes: [-15],
            lane: lane_over_bars(23, MAX_SONG_BARS, [[320, MAX_SONG_BARS]]),
        },
    ],
},

//----------------------------------------------------------------------------
// The songs below are here for the corners of the format rather than for what
// they sound like. Every field has a top and a bottom, and a link that carries
// one of them wrong is a link that opens as the wrong song, so each end of
// each range wants to be sat on by something.
//
// They are still playable, which is the point of putting them here rather than
// building them inside a test: a corner case that can't be listened to is one
// nobody would notice was wrong.
//----------------------------------------------------------------------------

{
    // Every field of this one is at the top of its range: the fastest tempo
    // the format holds, the hardest swing, the longest delay with the most
    // feedback, both ends of the stereo field, and a row sent to the delay at
    // full level. Gabber is what music at 280 actually sounds like, so that is
    // what this is.
    name: 'a hardcore stomp at the top of the range',
    tempo: 280,
    swing: 75,
    delay_time: 31,         // the longest the delay goes
    delay_feedback: 75,     // and the most it feeds back
    song_bars: 8,
    patterns: [
        {
            samples: ['kick_distort_01', 'hat_distort_01', 'snare_distort_01'],
            rows: [
                'x...x...x...x...',
                '..x...x...x...x.',
                '....x.......x...',
            ],
            pans:    [  0, 10, -10],    // hard right and hard left
            volumes: [  0, -3,  -6],    // the kick at the top of the range
            sends:   [  0, -3,  -3],    // and sent to the delay at full level
            lane: 'xxxx',
        },
        {   // The hat here is pulled all the way down, which is how a row gets
            // muted without being emptied. It still plays, so it still travels
            // in the link, which is the case worth having: a row at the bottom
            // of the level range is not the same as a row with nothing in it.
            samples: ['kick_distort_02', 'hat_distort_01', 'crash_02'],
            rows: [
                'x.x.x.x.x.x.x.x.',
                '..x...x...x...x.',
                'x...............',
            ],
            pans:    [  0,  10, -10],
            volumes: [  0, -30,  -6],   // -30 is silence
            sends:   [  0,  -3,   0],
            lane: '....xxxx',
        },
    ],
},

{
    // And the bottom of the same ranges: the slowest tempo, and a delay set to
    // its shortest time with no feedback at all, which is the setting that
    // makes it a slapback rather than an echo.
    name: 'a doom crawl at the bottom of the range',
    tempo: 40,
    delay_time: 0,          // the shortest the delay goes
    delay_feedback: 0,      // and no feedback, so a single repeat
    song_bars: 4,
    patterns: [
        {
            samples: ['kick_01', 'crash_01', 'tom_low_01'],
            rows: [
                'x.......x.......',
                'x...............',
                '............x...',
            ],
            pans:    [  0,   0,  -7],
            volumes: [  0,  -6, -10],
            sends:   [-30, -30, -12],
            lane: 'xxxx',
        },
    ],
},

{
    // A pattern with as many rows as one can hold, which is also the whole of
    // the default kit in the order a new pattern hands it out, so every row of
    // it plays the sample the encoding expects and costs a single bit to say.
    //
    // The sixth row is deliberately shapeless: it fits no motif, no group and
    // has too many steps to be worth naming one at a time, so it is written
    // out flat. Some row somewhere has to be, and this is that row.
    name: 'a sixteen row percussion wall',
    tempo: 100,
    song_bars: 16,
    patterns: [
        {
            samples: [
                'kick_01', 'snare_01', 'hat_closed_01', 'hat_open_01',
                'clap_01', 'rimshot_01', 'tom_low_01', 'tom_mid_01',
                'tom_hi_01', 'cowbell_01', 'claves_01', 'ride_01',
                'crash_01', 'maracas_01', 'perc_01', 'bongo_01',
            ],
            rows: [
                //  bar 1              bar 2
                'x...x...x...x...' + 'x...x...x...x...',
                '....x.......x...' + '....x.......x...',
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
                '......x.......x.' + '......x.......x.',
                '....x...........' + '....x.......x...',
                'xx.x..xxx.x..x.x' + '.xx..xxx.x..x.xx',   // the shapeless one
                '..........x.....' + '................',
                '.............x..' + '................',
                '...............x' + '................',
                '..x..x..x..x..x.' + '.x..x..x..x..x..',   // three, against four
                'x..x..x...x.x...' + 'x..x..x...x.x...',
                'x...............' + 'x...............',
                'x...............' + '................',
                'x.xx.x.xx.x.xx.x' + 'x.xx.x.xx.x.xx.x',
                '........x.......' + '........x.......',
                '..x...x.....x...' + '....x...x.......',
            ],
            lane: 'xxxx',
        },
        {   // Four bars that repeat a bar at a time, except that the second
            // bar is its own thing and differs in too many steps to be worth
            // writing as exceptions to the first. A row shaped this way is
            // what the widest of the group schemes is for.
            samples: ['rimshot_02', 'kick_01'],
            rows: [
                'x..x..x...x.x...' + 'xxx.x.xx..x.xxx.' +
                'x..x..x...x.x...' + 'x..x..x...x.x...',

                'x...x...x...x...' + 'x...x...x...x...' +
                'x...x...x...x...' + 'x...x...x...x...',
            ],
            pans:    [ 4, 0],
            volumes: [-4, 0],
            lane: 'xxxx',
        },
    ],
},

{
    // Patterns of one, two and three steps, which are the shortest the format
    // holds, turning over against longer ones. Nothing here lines up twice the
    // same way inside the song, and the count of patterns is past what any
    // other song in the corpus reaches.
    //
    // The last two layers are the sparsest rows here: a handful of steps in
    // four bars, which is where naming the steps that play beats writing a bit
    // for every step that doesn't.
    name: 'a phasing pulse of tiny patterns',
    tempo: 132,
    song_bars: 16,
    patterns: [
        {   // One step, so it lands on every step of the song
            samples: ['hat_closed_05'],
            rows: ['x'],
            volumes: [-18],
            lane: lane_from_bar(0, 1, 16),
        },
        {
            samples: ['kick_01'],
            rows: ['x.'],
            lane: lane_from_bar(0, 2, 16),
        },
        {
            samples: ['claves_01'],
            rows: ['x..'],
            pans: [-5],
            volumes: [-8],
            lane: lane_from_bar(1, 3, 16),
        },
        {
            samples: ['rimshot_01'],
            rows: ['x..x'],
            pans: [5],
            volumes: [-9],
            lane: lane_from_bar(2, 4, 16),
        },
        {
            samples: ['cowbell_01'],
            rows: ['x....x'],
            pans: [-8],
            volumes: [-11],
            lane: lane_from_bar(3, 6, 16),
        },
        {
            samples: ['bongo_01'],
            rows: ['x...x....'],
            pans: [7],
            volumes: [-10],
            lane: lane_from_bar(4, 9, 16),
        },
        {
            samples: ['maracas_01'],
            rows: ['x..x..x...'],
            pans: [-3],
            volumes: [-13],
            lane: lane_from_bar(5, 10, 16),
        },
        {
            samples: ['tom_low_01'],
            rows: ['x......x......'],
            pans: [3],
            volumes: [-9],
            lane: lane_from_bar(6, 14, 16),
        },
        {
            samples: ['perc_02'],
            rows: ['x........x........'],
            pans: [-6],
            volumes: [-12],
            lane: lane_from_bar(7, 18, 16),
        },
        {
            samples: ['glass_01'],
            rows: ['x.........x..........'],
            pans: [8],
            volumes: [-15],
            lane: lane_from_bar(8, 21, 16),
        },
        {
            samples: ['twang_01'],
            rows: ['x............x........'],
            pans: [-9],
            volumes: [-14],
            lane: lane_from_bar(9, 22, 16),
        },
        {   // Ten steps in four bars, which is as sparse as a row gets before
            // writing it out flat is the shorter of the two
            samples: ['zap_04'],
            rows: [
                'x....x.......x..' + '......x......x..' +
                '...x.....x......' + '..x.......x....x',
            ],
            pans: [6],
            volumes: [-16],
            sends: [-9],
            lane: lane_from_bar(10, 64, 16),
        },
        {
            samples: ['metal_01'],
            rows: [
                'x....x.......x..' + '......x........x' +
                '.............x..' + '....x.......x...',
            ],
            pans: [-4],
            volumes: [-17],
            sends: [-6],
            lane: lane_from_bar(12, 64, 16),
        },
    ],
},


{
    // Acid techno at 132, and the song the filter is here for. A filter is a
    // gesture rather than a setting, so a song that carries one is a song that
    // was left mid-sweep: this one is parked with the high-pass up around 400
    // Hz and the resonance well up, which is where a track sits during the
    // filtered stretch before it drops. The kick is still playing every beat
    // and almost none of it is getting through, which is the point.
    //
    // It is also the only song here that sets the filter and the delay at
    // once, both being project-wide effects that a link has to carry side by
    // side. Nothing else in the corpus can, the filter being newer than the
    // rest of them.
    name: 'a filtered acid techno stretch',
    tempo: 132,
    filter: 52,             // a high-pass a little over a third of the way up
    resonance: 26,          // and enough of a peak to be heard as one
    delay_time: 19,         // three steps, i.e. a dotted eighth
    delay_feedback: 50,
    song_bars: 24,
    patterns: [
        {   // the four to the floor the filter is sitting on top of
            samples: ['kick_05', 'hat_closed_03', 'clap_02'],
            rows: [
                'x...x...x...x...',
                '..x...x...x...x.',
                '....x.......x...',
            ],
            pans:    [ 0, -3,  3],
            volumes: [ 0, -8, -5],
            lane: 'xxxxxxxxxxxxxxxxxxxxxxxx',
        },
        {   // the roll that opens up underneath it, echoed rather than dry so
            // that the repeats are what carries through the high-pass
            samples: ['hat_open_03', 'rimshot_03', 'perc_03'],
            rows: [
                '......x.......x.',
                '..x..x..x..x..x.',
                '...x........x...',
            ],
            pans:    [  4,  -6,   7],
            volumes: [-10, -12, -14],
            sends:   [-12,  -6, -18],
            lane: '....xxxxxxxxxxxxxxxxxxxx',
        },
        {   // a two bar stab layer, sent hardest of anything here: a resonant
            // high-pass leaves the metallic end of these almost untouched,
            // which is what the top of the track is made of while it is up
            samples: ['metal_02', 'zap_02'],
            rows: [
                //  bar 1              bar 2
                '............x...' + '......x.........',
                '..x.............' + '..........x..x..',
            ],
            pans:    [ -7,   6],
            volumes: [-12, -15],
            sends:   [ -3,  -9],
            lane: '....xxxxxxxx',
        },
    ],
},

{
    // The longest arrangement here that isn't the artificial maximum: 96 bars
    // at 133, ten patterns, and layered rather than tiled, so its lanes are
    // long unbroken runs of hundreds of cells between them. That is what it is
    // in the corpus for. Everything else long is either one pattern repeated
    // to the end of the timeline or a handful of two bar patterns handing off
    // to each other, and neither of those says much about what a link costs
    // once a real arrangement fills it out.
    //
    // Its patterns come in four lengths — 12, 16 and 32 steps — so the lanes
    // hold cells of three quarters of a bar, one bar and two bars alongside
    // each other. The 12 step layer is the one that doesn't divide the bar: it
    // comes back into line with the grid every three bars and starts halfway
    // through a bar the second time it comes in, which is why its lane is
    // written out rather than built from bar numbers.
    //
    // The arrangement is the hypnotic one: kick and offbeat open hat holding
    // under everything, layers arriving one section at a time, a breakdown at
    // bar 48 that drops the kick and leaves the delay holding the room, and a
    // peak from bar 56 to the end.
    name: 'a 96 bar berlin techno arrangement',
    tempo: 133,
    delay_feedback: 55,
    song_bars: 96,
    patterns: [
        {   // the kick and the offbeat open hat, under all of it but the
            // breakdown
            samples: ['hat_open_03', 'kick_09'],
            rows: [
                '..x...x...x...x.',
                'x...x...x...x...',
            ],
            pans:    [ 3,  0],
            volumes: [-12, 0],
            lane: 'x'.repeat(48) + '.'.repeat(8) + 'x'.repeat(40),
        },
        {   // two bars of hats, the second closing up at its end
            samples: ['hat_closed_05', 'hat_closed_02'],
            rows: [
                //  bar 1              bar 2
                '.x.x.x.x.x.x.x.x' + '.x.x.x.x.x.x.xxx',
                '..x...x...x...x.' + '..x...x...x.x.x.',
            ],
            pans:    [ -7,   6],
            volumes: [-17, -13],
            lane: '..xxxxxxxxxxxxxxxxxx........xxxxxxxxxxxxxxxxxxxx',
        },
        {   // the backbeat, with the rimshot sent to the delay
            samples: ['rimshot_02', 'clap_02'],
            rows: [
                '..........x..x..',
                '....x.......x...',
            ],
            pans:    [  6,  -2],
            volumes: [-11,  -4],
            sends:   [ -8, -30],
            lane: '.'.repeat(8) + 'x'.repeat(40) + '.'.repeat(12) + 'x'.repeat(36),
        },
        {   // the stabs, both sent hard, which is what the breakdown is left
            // holding once the kick goes
            samples: ['metal_01', 'zap_02'],
            rows: [
                //  bar 1              bar 2
                '............x...' + '................',
                '................' + '..........x.....',
            ],
            pans:    [ -8,   7],
            volumes: [-13, -16],
            sends:   [ -4,  -8],
            lane: '......xxxxxxxxxx..xxxxxx........xxxxxxxxxxxxxx',
        },
        {   // twelve steps, so it walks around the bar and only lines up again
            // every three of them. It comes in halfway through bar 16 the
            // first time and halfway through bar 64 the second, a lane cell
            // being three quarters of a bar rather than a bar
            samples: ['perc_02', 'bongo_02'],
            rows: [
                'x....x..x...',
                '..x.......x.',
            ],
            pans:    [  9,  -9],
            volumes: [-15, -18],
            sends:   [-14, -20],
            lane: '.'.repeat(22) + 'x'.repeat(42) + '.'.repeat(22) + 'x'.repeat(31),
        },
        {   // ride and a low tom, over the second half of each long stretch
            samples: ['ride_01', 'tom_low_03'],
            rows: [
                '..x...x...x...x.',
                '..........x.....',
            ],
            pans:    [ -5,   5],
            volumes: [-16, -14],
            sends:   [-20, -12],
            lane: '.'.repeat(32) + 'x'.repeat(16) + '.'.repeat(20) + 'x'.repeat(28),
        },
        {   // the breakdown itself: five rows, no kick, everything sent, and
            // the widest pattern here
            samples: ['crash_01', 'hat_open_03', 'glass_01', 'metal_01', 'rimshot_01'],
            rows: [
                //  bar 1              bar 2
                'x...............' + '................',
                '..x.......x.....' + '..x.......x...x.',
                '............x...' + '......x.........',
                '............x...' + '....x.......x...',
                '......x.........' + '......x...x.....',
            ],
            pans:    [  0,   4,   8,  -8,   6],
            volumes: [-10, -13, -15, -12, -11],
            sends:   [-16, -12,  -3,  -3,  -6],
            lane: '........................xxxx',
        },
        {   // the four bars that build back out of the breakdown, the distorted
            // snare filling in as they go
            samples: ['hat_closed_02', 'clap_03', 'snare_distort_01'],
            rows: [
                '.x.x.x.x.x.x.x.x',
                '............x.x.',
                'x...x...x.x.x.xx',
            ],
            pans:    [  6,   0,   0],
            volumes: [-13,  -8,  -7],
            sends:   [-30, -12, -14],
            lane: '.'.repeat(56) + 'xxxx',
        },
        {   // the top of the peak, glass and bongos over the last stretch
            samples: ['glass_02', 'bongo_03', 'tom_mid_04'],
            rows: [
                //  bar 1              bar 2
                '..........x.....' + '..........x..x..',
                'x..x..x..x..x...' + 'x..x..x..x..x..x',
                '................' + '...........x.x..',
            ],
            pans:    [ -9,   8,  -4],
            volumes: [-16, -14, -12],
            sends:   [-12, -18, -30],
            lane: '.'.repeat(36) + 'xxxxxxxx',
        },
        {   // one crash, dropped onto the timeline wherever a section turns
            // over. A one bar pattern across 96 bars reads as nothing written
            // out as a grid, and as the eight bars it lands on written this way
            samples: ['crash_01'],
            rows: ['x...............'],
            volumes: [-9],
            sends: [-12],
            lane: lane_at_cells([8, 24, 32, 60, 64, 72, 80, 88]),
        },
    ],
},

{
    // Boom bap again, but as a whole song rather than as an arrangement: 64
    // bars at 88 is two minutes and fifty-five seconds, which is where a rap
    // single sits, and the corpus is otherwise short on songs that run as long
    // as a real one at a tempo this slow. A slow song is the expensive case for
    // the encoding in bars rather than in patterns.
    //
    // Laid out the way the hip hop arrangement above is, two bar patterns
    // tiling the timeline, but sectioned the way a song with a vocal over it
    // has to be: four bars of intro, sixteen bar verses that give their last
    // two bars to the turnaround so they fill into the hook rather than
    // repeating into it, hooks that add a clap and a vocal stab, a breakdown
    // that drops the kick, and an outro that crashes and stops.
    name: 'a 64 bar rap arrangement',
    tempo: 88,
    swing: 57,              // enough shuffle to sit behind a vocal
    delay_time: 14,         // two steps, for the rimshot throws
    delay_feedback: 25,
    song_bars: 64,
    patterns: [
        {   // intro: hats and rimshot, kick walking in over the second bar
            samples: ['hat_closed_02', 'rimshot_03', 'kick_05'],
            rows: [
                //  bar 1              bar 2
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
                '..x.......x.....' + '..x.......x...x.',
                '................' + 'x.........x.....',
            ],
            pans:    [  4,  -6,   0],
            volumes: [-12, -14,   0],
            sends:   [-30, -12, -30],
            lane: 'xx..............................',
        },
        {   // main verse groove
            samples: ['hat_closed_02', 'rimshot_03', 'snare_06', 'kick_05'],
            rows: [
                //  bar 1              bar 2
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
                '..............x.' + '..x...........x.',
                '....x.......x...' + '....x.......x...',
                'x.....x...x.....' + 'x.......x.x.....',
            ],
            pans:    [  4,  -6,   0,   0],
            volumes: [-11, -15,  -3,   0],
            sends:   [-30, -14, -30, -30],
            lane: '..xxxxxxx.....xxxxxxx.......xx..',
        },
        {   // turnaround, fill in the second bar, closing each verse
            samples: ['hat_closed_02', 'rimshot_03', 'snare_06', 'kick_05'],
            rows: [
                //  bar 1              bar 2
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.xxxxxx',
                '..............x.' + '................',
                '....x.......x...' + '....x.......x.x.',
                'x.....x...x.....' + 'x.........x.x...',
            ],
            pans:    [  4,  -6,   0,   0],
            volumes: [-11, -15,  -3,   0],
            sends:   [-30, -14, -30, -30],
            lane: '.........x...........x........x.',
        },
        {   // hook: clap doubling the snare, open hat, and a vocal stab sent to
            // the delay
            samples: [
                'hat_open_02',
                'hat_closed_02',
                'vocal_what_01',
                'clap_02',
                'snare_06',
                'kick_05',
            ],
            rows: [
                //  bar 1              bar 2
                '......x.......x.' + '......x.......x.',
                'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.x.',
                'x...............' + '............x...',
                '....x.......x...' + '....x.......x...',
                '....x.......x...' + '....x.......x...',
                'x.....x...x.....' + 'x.....x...x...x.',
            ],
            pans:    [  7,   4,  -3,   3,   0,   0],
            volumes: [-13, -11,  -8,  -8,  -3,   0],
            sends:   [-30, -30, -10, -30, -30, -30],
            lane: '..........xxxx..........xxxx....',
        },
        {   // breakdown: kick out, rimshot and hats holding the space
            samples: ['hat_closed_02', 'rimshot_03', 'snare_06', 'kick_05'],
            rows: [
                //  bar 1              bar 2
                'x...x...x...x...' + 'x...x...x...x...',
                '..x...x...x...x.' + '..x...x...x...x.',
                '............x...' + '....x...........',
                'x...............' + 'x.......x.......',
            ],
            pans:    [  4,  -7,   0,   0],
            volumes: [-11, -13,  -5,  -2],
            sends:   [-30,  -8, -30, -30],
            lane: '......................xx........',
        },
        {   // outro: last two bars, crash on the downbeat and a stop
            samples: ['crash_01', 'hat_closed_02', 'snare_06', 'kick_05'],
            rows: [
                //  bar 1              bar 2
                'x...............' + '................',
                'x.x.x.x.x.x.x.x.' + 'x.x.x...........',
                '....x.......x...' + '....x...........',
                'x.....x...x.....' + 'x.......x.......',
            ],
            pans:    [  0,   4,   0,   0],
            volumes: [ -8, -11,  -3,   0],
            lane: '...............................x',
        },
        {   // three bars long, so the shaker never lines up with the two bar
            // patterns and walks around them for the whole middle of the song
            samples: ['maracas_01', 'perc_03'],
            rows: [
                //  bar 1              bar 2              bar 3
                '..x..x..x..x..x.' + '..x..x..x..x..x.' + '..x..x..x..x..x.',
                '........x.......' + '............x...' + '......x.........',
            ],
            pans:    [ -8,   9],
            volumes: [-16, -17],
            sends:   [-30, -16],
            lane: '.......' + 'x'.repeat(14),
        },
    ],
},
];

// Turn one of the entries above into a project
export function build_song(song)
{
    let project = new Project();
    project.set_tempo(song.tempo);

    if (song.swing !== undefined)
        project.set_swing(song.swing);

    project.patterns = [];
    project.lanes = [];

    if (song.delay_time !== undefined)
        project.set_delay_time(song.delay_time);

    if (song.delay_feedback !== undefined)
        project.set_delay_feedback(song.delay_feedback);

    if (song.filter !== undefined)
        project.set_filter(song.filter);

    if (song.resonance !== undefined)
        project.set_resonance(song.resonance);

    for (let { samples, rows, lane, pans, volumes, sends } of song.patterns)
    {
        console.assert(samples.length == rows.length);
        console.assert(!pans || pans.length == rows.length);
        console.assert(!volumes || volumes.length == rows.length);
        console.assert(!sends || sends.length == rows.length);

        let pat = new Pattern(samples.map(name => get_sample_idx(name)), rows[0].length);
        pat.rows = rows.map(cells);

        // A pattern that says nothing about panning keeps every row centred,
        // and one that says nothing about levels leaves them all at the top
        if (pans)
            pans.forEach((pan, row_idx) => pat.set_row_pan(row_idx, pan));

        if (volumes)
            volumes.forEach((vol, row_idx) => pat.set_row_volume(row_idx, vol));

        // And one that says nothing about the delay leaves every row dry
        if (sends)
            sends.forEach((send, row_idx) => pat.set_row_send(row_idx, send));

        project.patterns.push(pat);
        project.lanes.push(typeof lane == 'string'? lane_cells(lane) : lane);
    }

    return project;
}

// Look an entry up by name, so that a test about one song says which
export function get_song(name)
{
    let song = CORPUS.find(song => song.name == name);

    if (!song)
        throw Error(`no song named '${name}' in the corpus`);

    return build_song(song);
}
