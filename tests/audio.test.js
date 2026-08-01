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
    get_ctx,
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
    MIN_SEND,
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

// Whether loading the kit built an audio context, which it must not: see
// get_audio_ctx in audio.js. This is read here rather than inside the test
// that checks it because the tests share this module and the ones that play
// something build a context, so by the time they have run the answer has
// changed. Everything below plays these two samples, which is what says the
// other half of it works: they were downloaded before there was a context and
// they are decoded and audible once there is one.
const ctx_after_loading = get_ctx();

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
// Loading the kit
//============================================================================

test("loading a sample does not build an audio context", () =>
{
    // Safari on iOS starts a context suspended if it was built before the page
    // was touched, and does not reliably let resume() bring it back. The kit
    // starts downloading as the page opens, so the download has to be able to
    // finish without one: what needs a context is decoding, and that waits.
    //
    // This being wrong is silence on an iPhone and nothing at all anywhere
    // else, which is why it is worth a test rather than a comment.
    assert.equal(ctx_after_loading, null);
});

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

//============================================================================
// The delay
//
// One delay for the whole project, fed by whatever the rows send it. What
// these are about is where a voice is tapped from and that a project sending
// it nothing never builds it at all: the nodes are what a phone pays for.
//============================================================================

// Follow a voice out to the output, so that the chain it was routed through
// can be read as the list of node types it passed through
function voice_chain(voice)
{
    let chain = [];

    for (let node = voice; node; node = node.dst)
        chain.push(node.type);

    return chain;
}

// The nodes hanging off the side of a voice's chain, i.e. everything it feeds
// that isn't the way onwards to the output
function voice_taps(voice)
{
    let taps = [];

    for (let node = voice; node; node = node.dst)
        taps.push(...node.dsts.slice(1));

    return taps;
}

// Play one step of a single pattern whose one row plays a kick, mixed the way
// the caller asks for, and hand back the voice it started
async function mixed_voice({ pan = 0, volume = 0, send = MIN_SEND })
{
    let project = new Project();
    project.set_tempo(ONE_STEP_TEMPO);

    let pat = new Pattern([KICK], 1);
    pat.rows = [[1]];
    pat.set_row_pan(0, pan);
    pat.set_row_volume(0, volume);
    pat.set_row_send(0, send);
    project.patterns = [pat];

    await play_pattern(project, 0);
    stop_playback();

    let voices = drain_voices();
    assert.equal(voices.length, 1);

    return voices[0];
}

test("a dry row centred at full level is routed straight to the output", async () =>
{
    // The nodes a row costs are paid for by the rows that were actually set,
    // and a row nobody touched has been set to nothing
    let voice = await mixed_voice({});

    // The one gain here is the master volume, which every voice goes through
    assert.deepEqual(voice_chain(voice), ['source', 'gain', 'destination']);
    assert.deepEqual(voice_taps(voice), []);
});

test("a row sent to the delay is tapped after its level and its panning", async () =>
{
    // Echoes have to sit where the row sits and come down with it as it is
    // turned down, so the send is taken from the far end of the chain rather
    // than from the source
    let voice = await mixed_voice({ pan: 5, volume: -6, send: -6 });

    // The row's own level, then its panning, then the master volume
    assert.deepEqual(
        voice_chain(voice),
        ['source', 'gain', 'panner', 'gain', 'destination']
    );

    let taps = voice_taps(voice);
    assert.equal(taps.length, 1);
    assert.equal(taps[0].type, 'gain');

    // The tap is on the panner, which is the last thing the row owns before
    // its sound is handed to the master volume
    let panner = voice.dst.dst;
    assert.equal(panner.type, 'panner');
    assert.equal(panner.dsts.length, 2);
});

test("a row sent to the delay is panned even when it sits dead centre", async () =>
{
    // A centred row does without a panner when it is dry, but its echoes would
    // then arrive somewhere other than where it is
    let voice = await mixed_voice({ pan: 0, send: -12 });

    assert.ok(voice_chain(voice).includes('panner'));
});

test("the delay is built once and shared by the rows that use it", async () =>
{
    let project = new Project();
    project.set_tempo(ONE_STEP_TEMPO);

    let pat = new Pattern([KICK, SNARE], 1);
    pat.rows = [[1], [1]];
    pat.set_row_send(0, -6);
    pat.set_row_send(1, -12);
    project.patterns = [pat];

    await play_pattern(project, 0);
    stop_playback();

    let voices = drain_voices();
    assert.equal(voices.length, 2);

    // Both sends land on the same node, there being one delay for the project
    // rather than one per row
    let [first, second] = voices.map(voice => voice_taps(voice)[0].dst);

    assert.equal(first, second);
    assert.equal(first.type, 'gain');
});
