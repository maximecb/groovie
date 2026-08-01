// Tests for the parts of view.js that don't need a DOM: the labels the mixer
// controls are read out with. Everything else in the file builds elements, and
// there is nothing here to build them in.
//
// These are the only place a row's panning and level are put into words, and
// what the words say has to hold against what playback does with the same
// values. Pattern.row_stereo_pan and Pattern.row_gain are the other half of
// that, and are tested in model.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";

import { pan_label, volume_label, send_label, delay_time_label } from "../view.js";

import {
    MIN_PAN,
    MAX_PAN,
    DEFAULT_PAN,
    MIN_VOLUME,
    MAX_VOLUME,
    MIN_SEND,
    MAX_SEND,
    MIN_DELAY_TIME,
    MAX_DELAY_TIME,
    DELAY_STEP_FRACTIONS,
} from "../model.js";

//============================================================================
// Stereo position
//============================================================================

test("the centre is named rather than numbered", () =>
{
    assert.equal(pan_label(DEFAULT_PAN), 'C');
});

test("a panned row reads as a side and how far over it is", () =>
{
    // A mixer is labelled in percent and the model holds tenths, so hard over
    // reads as 100 rather than as the 10 it is held as
    assert.equal(pan_label(MIN_PAN), 'L100');
    assert.equal(pan_label(MAX_PAN), 'R100');
    assert.equal(pan_label(MIN_PAN / 2), 'L50');
    assert.equal(pan_label(MAX_PAN / 2), 'R50');
});

test("every stereo position fits the width its readout is given", () =>
{
    // The readout is sized to hold the longest label rather than measured once
    // it holds one (see make_pan_ctl in view.js), so a longer label would push
    // the row it belongs to out of line with the rest of the grid
    for (let pan = MIN_PAN; pan <= MAX_PAN; ++pan)
        assert.ok(pan_label(pan).length <= 4, `${pan}: ${pan_label(pan)}`);
});

//============================================================================
// Level
//============================================================================

test("a level reads as the decibels it is held in", () =>
{
    assert.equal(volume_label(MAX_VOLUME), '0dB');
    assert.equal(volume_label(-12), '-12dB');
});

test("a row pulled all the way down reads as off", () =>
{
    // The bottom of the range mutes a row rather than making it very quiet, so
    // naming it -30dB would say the wrong thing about what it does. row_gain
    // is what makes that true of the sound; this is the same rule for the eye.
    assert.equal(volume_label(MIN_VOLUME), 'off');
});

test("every level fits the width its readout is given", () =>
{
    for (let volume = MIN_VOLUME; volume <= MAX_VOLUME; ++volume)
    {
        assert.ok(
            volume_label(volume).length <= 5,
            `${volume}: ${volume_label(volume)}`
        );
    }
});

//============================================================================
// Delay
//============================================================================

test("a row that gets no echo reads as off", () =>
{
    // The bottom of the travel takes a row out of the delay rather than
    // sending it a very quiet copy, which row_send_gain is the other half of
    assert.equal(send_label(MIN_SEND), 'off');
});

test("a delay send reads as the decibels it is held in", () =>
{
    assert.equal(send_label(MAX_SEND), '0dB');
    assert.equal(send_label(-9), '-9dB');
});

test("every delay send fits the width its readout is given", () =>
{
    for (let send = MIN_SEND; send <= MAX_SEND; ++send)
        assert.ok(send_label(send).length <= 5, `${send}: ${send_label(send)}`);
});

test("a delay time is named in steps rather than in milliseconds", () =>
{
    // The setting is a fraction of a step and the milliseconds it works out to
    // move with the tempo, so what the control says is the fraction
    let one = DELAY_STEP_FRACTIONS.findIndex(([n, d]) => n == 1 && d == 1);
    let half = DELAY_STEP_FRACTIONS.findIndex(([n, d]) => n == 1 && d == 2);
    let three = DELAY_STEP_FRACTIONS.findIndex(([n, d]) => n == 3 && d == 1);

    assert.equal(delay_time_label(one), '1 step');
    assert.equal(delay_time_label(half), '1/2 steps');
    assert.equal(delay_time_label(three), '3 steps');
});

test("every delay time fits the width its readout is given", () =>
{
    // The readout is reserved at the width of the longest name a setting can
    // have, so a longer one would shift the slider beside it as it is dragged
    for (let time = MIN_DELAY_TIME; time <= MAX_DELAY_TIME; ++time)
    {
        assert.ok(
            delay_time_label(time).length <= 10,
            `${time}: ${delay_time_label(time)}`
        );
    }
});
