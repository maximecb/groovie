// Tests for what the playback scheduler in audio.js starts, and in particular
// for the cap on how many voices a single step is allowed to.
//
// Playing the song plays every pattern the timeline lays across a step, so a
// project decides how much a step starts: the model allows 64 patterns of 16
// rows, which is 1024 voices landing at once, and a link carrying that is
// short enough to send to somebody. The cap is what stands between opening a
// link and having the tab locked up by it, so what these are about is that it
// holds where it has to and is nowhere near what a song actually does.
//
// The audio itself is faked (see web_audio.js). Nothing here listens to
// anything: a voice is a sample the scheduler started, and counting them is
// what says what a step did.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    install_web_audio,
    drain_voices,
    voice_sample,
} from "./web_audio.js";

import { CORPUS, build_song } from "./corpus.js";

import {
    Pattern,
    Project,
    MAX_PATTERNS,
    MAX_PAT_ROWS,
    MAX_TEMPO,
    MIN_VOLUME,
} from "../model.js";

import {
    MAX_STEP_VOICES,
    fetch_sample,
    get_sample_idx,
    play_pattern,
    play_song,
    stop_playback,
} from "../audio.js";

// The audio context is made on first use, so this has to be in place before
// anything below reaches for it
install_web_audio();

// Samples the tests below play. Only these two are ever loaded: a row playing
// anything else is a row whose sample hasn't arrived, which is what one of the
// tests is about.
const KICK = get_sample_idx('kick_01');
const SNARE = get_sample_idx('snare_01');
const UNLOADED = get_sample_idx('clap_01');

await fetch_sample(KICK);
await fetch_sample(SNARE);

// Tempo at which one lookahead window holds exactly one step, so that starting
// playback queues step 0 and nothing else: the window is 0.1s and 120 BPM is 8
// steps a second. The clock is stopped (see web_audio.js), so no later update
// queues anything either, and the voices that come back are one step's worth.
const ONE_STEP_TEMPO = 120;

// Likewise, the tempo at which a window holds two steps: 280 BPM is 18.67
// steps a second, so starting playback queues steps 0 and 1
const TWO_STEP_TEMPO = MAX_TEMPO;

//============================================================================
// Helpers
//============================================================================

// Build a song in which every pattern is placed at the start of the timeline
// and every cell is on, so that a step starts one voice per row of every
// pattern and the count is simply the rows the project holds.
//
// The samples are given per pattern, which is what makes it possible to say
// which patterns the voices of a step came from.
function dense_song(pat_samples, num_rows, tempo = ONE_STEP_TEMPO)
{
    let project = new Project();
    project.set_tempo(tempo);

    project.patterns = [];
    project.lanes = [];

    for (let sample_idx of pat_samples)
    {
        let pat = new Pattern(Array(num_rows).fill(sample_idx));
        pat.rows = pat.rows.map(row => row.fill(1));

        project.patterns.push(pat);
        project.lanes.push([1]);
    }

    return project;
}

// Play the song and take the voices that starting it queued
async function song_voices(project)
{
    await play_song(project);
    stop_playback();

    return drain_voices();
}

//============================================================================
// The cap on a step
//============================================================================

test("a step under the cap starts a voice for every cell landing on it", async () =>
{
    let voices = await song_voices(dense_song(Array(3).fill(KICK), MAX_PAT_ROWS));

    assert.equal(voices.length, 3 * MAX_PAT_ROWS);
});

test("a step right at the cap keeps every voice on it", async () =>
{
    let num_patterns = MAX_STEP_VOICES / MAX_PAT_ROWS;
    let voices = await song_voices(
        dense_song(Array(num_patterns).fill(KICK), MAX_PAT_ROWS)
    );

    assert.equal(voices.length, MAX_STEP_VOICES);
});

test("a step past the cap is held to it", async () =>
{
    let num_patterns = MAX_STEP_VOICES / MAX_PAT_ROWS + 1;
    let voices = await song_voices(
        dense_song(Array(num_patterns).fill(KICK), MAX_PAT_ROWS)
    );

    assert.equal(voices.length, MAX_STEP_VOICES);
});

test("the worst case a link can carry is held to the cap", async () =>
{
    // Every pattern the model allows, every row of each one filled, all of
    // them placed over the same steps. This is what the cap exists for.
    let project = dense_song(Array(MAX_PATTERNS).fill(KICK), MAX_PAT_ROWS);

    assert.equal(MAX_PATTERNS * MAX_PAT_ROWS, 1024);
    assert.equal((await song_voices(project)).length, MAX_STEP_VOICES);
});

test("each step gets the whole cap rather than a share of one", async () =>
{
    // Two steps are queued here rather than one, so a cap counted anywhere but
    // per step would leave the second step short or silent
    let project = dense_song(
        Array(MAX_PATTERNS).fill(KICK),
        MAX_PAT_ROWS,
        TWO_STEP_TEMPO
    );

    assert.equal((await song_voices(project)).length, 2 * MAX_STEP_VOICES);
});

test("a step over the cap drops the patterns the project holds last", async () =>
{
    // The cap is spent going through the patterns in order, so the ones at the
    // end of the project are the ones that fall off a step that is over it
    let num_patterns = MAX_STEP_VOICES / MAX_PAT_ROWS;
    let pat_samples = Array(num_patterns).fill(KICK).concat([SNARE, SNARE]);

    let voices = await song_voices(dense_song(pat_samples, MAX_PAT_ROWS));

    assert.equal(voices.length, MAX_STEP_VOICES);
    assert.ok(
        voices.every(voice => voice_sample(voice) == 'kick_01'),
        'the patterns held first are the ones that were kept'
    );
});

//============================================================================
// What the cap is not spent on
//
// A row that makes no sound starts nothing, so charging the step for it would
// let silence push audible rows off a step: a project could go quiet for
// reasons nobody could see on the grid.
//============================================================================

test("a row pulled all the way down does not use up the step's voices", async () =>
{
    // Enough muted rows to spend the whole cap, ahead of a pattern that plays
    let num_muted = MAX_STEP_VOICES / MAX_PAT_ROWS;
    let pat_samples = Array(num_muted).fill(KICK).concat([SNARE]);

    let project = dense_song(pat_samples, MAX_PAT_ROWS);

    for (let pat_idx = 0; pat_idx < num_muted; ++pat_idx)
    {
        let pat = project.patterns[pat_idx];

        for (let row_idx = 0; row_idx < pat.num_rows; ++row_idx)
            pat.set_row_volume(row_idx, MIN_VOLUME);
    }

    let voices = await song_voices(project);

    assert.equal(voices.length, MAX_PAT_ROWS);
    assert.ok(voices.every(voice => voice_sample(voice) == 'snare_01'));
});

test("a sample that hasn't loaded does not use up the step's voices", async () =>
{
    // Same shape, with rows whose sample never arrived rather than rows turned
    // down. A sample loads once and stays loaded, so this one is never asked
    // for anywhere in this file.
    let num_silent = MAX_STEP_VOICES / MAX_PAT_ROWS;
    let pat_samples = Array(num_silent).fill(UNLOADED).concat([SNARE]);

    let voices = await song_voices(dense_song(pat_samples, MAX_PAT_ROWS));

    assert.equal(voices.length, MAX_PAT_ROWS);
    assert.ok(voices.every(voice => voice_sample(voice) == 'snare_01'));
});

//============================================================================
// What the cap leaves alone
//============================================================================

test("playing a single pattern is not something the cap can reach", async () =>
{
    // One pattern is at most MAX_PAT_ROWS rows, which is well under the cap,
    // so editing a pattern is never affected by it however full the grid is
    let project = dense_song([KICK], MAX_PAT_ROWS);

    await play_pattern(project, 0);
    stop_playback();

    assert.equal(drain_voices().length, MAX_PAT_ROWS);
});

test("no song anyone would write comes near the cap", async () =>
{
    // The corpus is what says the cap is set above music rather than through
    // it. This counts what each step of each song would start, which is what
    // queue_song_step goes on to do.
    for (let song of CORPUS)
    {
        let project = build_song(song);
        let peak = 0;

        for (let step = 0; step < project.song_num_steps; ++step)
        {
            let num_voices = 0;

            for (let pat_idx = 0; pat_idx < project.num_patterns; ++pat_idx)
            {
                if (!project.pat_active_at(pat_idx, step))
                    continue;

                let pat = project.patterns[pat_idx];
                let step_idx = step % pat.num_steps;

                for (let row_idx = 0; row_idx < pat.num_rows; ++row_idx)
                {
                    if (pat.get_cell(row_idx, step_idx) && pat.row_gain(row_idx) > 0)
                        ++num_voices;
                }
            }

            peak = Math.max(peak, num_voices);
        }

        assert.ok(
            peak < MAX_STEP_VOICES,
            `${song.name} peaks at ${peak} voices on a step, against a cap of ${MAX_STEP_VOICES}`
        );
    }
});
