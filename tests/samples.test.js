// Tests for the sample library in audio.js, i.e. the mapping between the three
// ways of referring to a sample: its index, its name and the path of its file.
//
// Playback isn't covered here: it needs Web Audio, which is why audio.js keeps
// the audio context out of module scope and why this file can import it at all.
//
// The sample files themselves, and sample_list.js against what's on disk, are
// checked by tools/check_samples.py rather than here.

import { test } from "node:test";
import assert from "node:assert/strict";

import { drain_asserts } from "./setup.js";

import {
    NUM_SAMPLES,
    SORTED_SAMPLE_IDXS,
    get_sample_idx,
    get_sample_name,
    get_sample_path,
} from "../audio.js";

test("importing the sample library trips none of its own checks", () =>
{
    // audio.js states several invariants at module scope: that the list isn't
    // empty, that it's sorted by name, and that it fits the encoding. Importing
    // it above ran them, and the test setup would have recorded any failure.
    assert.equal(drain_asserts().length, 0);
});

test("there are samples, and few enough of them to encode", () =>
{
    // A sample index is 9 bits wide in a shared link (SAMPLE_IDX_BITS in
    // model.js), so this is the point where adding samples breaks sharing
    assert.ok(NUM_SAMPLES > 0);
    assert.ok(NUM_SAMPLES <= 512, `${NUM_SAMPLES} samples is past what a link holds`);
});

test("every sample's name and index refer back to each other", () =>
{
    for (let sample_idx of SORTED_SAMPLE_IDXS)
    {
        let sample_name = get_sample_name(sample_idx);

        assert.equal(typeof sample_name, 'string', `sample ${sample_idx} has a name`);
        assert.equal(get_sample_idx(sample_name), sample_idx, sample_name);
    }
});

test("every sample's path is its name under the samples directory", () =>
{
    for (let sample_idx of SORTED_SAMPLE_IDXS)
    {
        let sample_name = get_sample_name(sample_idx);

        assert.equal(get_sample_path(sample_idx), `samples/${sample_name}.wav`);
    }
});

test("sample names are unique", () =>
{
    let names = SORTED_SAMPLE_IDXS.map(get_sample_name);

    assert.equal(new Set(names).size, names.length);
});

test("the sample list is in the alphabetical order the UI shows it in", () =>
{
    // Index order won't do: an index is assigned when a sample is added and
    // never changes, so it drifts away from alphabetical as samples come and go
    let names = SORTED_SAMPLE_IDXS.map(get_sample_name);

    assert.deepEqual(names, names.slice().sort());
});

test("an index with no sample behind it has no name or path", () =>
{
    // Indices are reserved permanently, so an index can outlive its file. A
    // link shared before a sample was removed still carries the index, and has
    // to load with the row that used it left silent rather than fail.
    // An index coming from a link encoded against a longer sample list arrives
    // the same way, so this covers that too
    assert.equal(get_sample_name(NUM_SAMPLES), undefined);
    assert.equal(get_sample_path(NUM_SAMPLES), undefined);
});

test("a name no sample goes by is refused", () =>
{
    assert.equal(get_sample_idx('no_such_sample'), undefined);
    assert.equal(drain_asserts().length, 1);
});

test("an index that isn't a number is refused", () =>
{
    get_sample_name('kick_01');
    assert.equal(drain_asserts().length, 1);

    get_sample_path('kick_01');
    assert.equal(drain_asserts().length, 1);
});
