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

import { get_sample_idx } from "../audio.js";
import { Pattern, Project, STEPS_PER_BAR } from "../model.js";

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
            samples: ['crash_01', 'ride_01', 'snare_01', 'kick_01'],
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
            samples: ['kick_09', 'clap_02', 'hat_closed_03', 'hat_open_03', 'perc_03'],
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

    for (let { samples, rows, lane } of song.patterns)
    {
        console.assert(samples.length == rows.length);

        let pat = new Pattern(samples.map(name => get_sample_idx(name)), rows[0].length);
        pat.rows = rows.map(cells);

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
