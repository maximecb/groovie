// Tests for the MIDI clock in midi.js: what goes out on the wire, and where on
// the playback line each message is stamped for.
//
// The clock is what outboard gear follows, so the two things that matter are
// that the pulses fall where the beat does and that the rate is the one that
// was asked for. Both are checked here against a plain position line rather
// than against the scheduler's, so that what is being looked at is the clock
// rather than the tempo maths behind it.
//
// The MIDI itself is faked (see web_midi.js). Nothing here is plugged into
// anything: a device is a list of the messages it was handed.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    install_web_midi,
    install_no_web_midi,
    install_refusing_web_midi,
    FIREFOX_UA,
    FIREFOX_FORK_UA,
    add_output,
    announce,
    clear_outputs,
    drain_sent,
} from "./web_midi.js";

import { STEPS_PER_BEAT } from "../model.js";

import {
    CLOCK_RATES,
    DEFAULT_RATE_IDX,
    midi_available,
    clock_is_enabled,
    enable_clock,
    disable_clock,
    set_clock_rate,
    start_clock,
    stop_clock,
    queue_clock,
    num_outputs,
    rate_label,
    rate_ppq,
} from "../midi.js";

install_web_midi();

// The system realtime messages the clock is made of, written out here rather
// than imported: what these tests are for is that the right bytes go out, and
// taking the bytes from the code under test would check nothing.
const MSG_CLOCK = 0xF8;
const MSG_START = 0xFA;
const MSG_STOP = 0xFC;

// Pulses a MIDI clock sends to the quarter note at the standard rate
const MIDI_PPQ = 24;

// The playback line these tests lay the clock over: one step every 100ms, so
// that a time reads as the position it belongs to
const MS_PER_STEP = 100;
const to_time = pos => pos * MS_PER_STEP;

// How far apart two pulses should land, in milliseconds, at a given rate.
// Worked out from the pulse count the rate is named by rather than from the
// ratio behind it, so that this doesn't restate the arithmetic under test.
function pulse_ms(rate_idx)
{
    return MS_PER_STEP * STEPS_PER_BEAT / rate_ppq(rate_idx);
}

// Put the clock back to a known state: no devices, a given rate, switched on,
// and at the top of a song. Module state outlives the test that set it, so
// every test that runs the clock starts from here.
async function reset_clock(rate_idx = DEFAULT_RATE_IDX)
{
    disable_clock();
    clear_outputs();
    set_clock_rate(rate_idx);
    await enable_clock();
    start_clock();
}

// The messages of one kind an output was handed, in the order they arrived
function sent_of(msgs, kind)
{
    return msgs.filter(m => m.msg == kind);
}

test('a browser with no Web MIDI has no clock to offer', () =>
{
    install_no_web_midi();
    assert.equal(midi_available(), false);

    install_web_midi();
    assert.equal(midi_available(), true);
});

test('Firefox is turned away even though it has Web MIDI', () =>
{
    // It has the API and won't hand it over without an add-on the user has to
    // install, so having the API is not what decides this
    install_web_midi(FIREFOX_UA);
    assert.equal(midi_available(), false);

    // Its forks carry the same gating, and say Firefox in among their own name
    install_web_midi(FIREFOX_FORK_UA);
    assert.equal(midi_available(), false);

    install_web_midi();
    assert.equal(midi_available(), true);
});

// Runs before anything that enables the clock successfully, access being kept
// once granted: a later refusal would never reach the browser to be refused.
test('a browser refusing access says why, and leaves the clock off', async () =>
{
    let reason = 'WebMIDI requires a site permission add-on to activate';
    install_refusing_web_midi(reason);

    // The refusal is the browser's to explain. Reporting it as a plain failure
    // here would drop the one part of it that says what to do.
    await assert.rejects(enable_clock(), err => err.message == reason);

    assert.equal(clock_is_enabled(), false);

    install_web_midi();
});

test('a rate is named by the pulse count it works out to', () =>
{
    // The standard rate comes first, that being the one to try before any of
    // the others
    assert.equal(rate_label(DEFAULT_RATE_IDX), '1:1');
    assert.equal(rate_ppq(DEFAULT_RATE_IDX), MIDI_PPQ);

    for (let idx = 0; idx < CLOCK_RATES.length; ++idx)
    {
        let [num, den] = CLOCK_RATES[idx];

        assert.equal(rate_label(idx), `${num}:${den}`);
        assert.equal(rate_ppq(idx), MIDI_PPQ * num / den);

        // A rate that didn't divide the beat into whole pulses would be one
        // whose label said something the clock doesn't do
        assert.equal(rate_ppq(idx) % 1, 0, `1 in ${num}:${den}`);
    }
});

test('nothing is sent while the clock is switched off', () =>
{
    disable_clock();
    clear_outputs();

    let dev = add_output('dev');
    start_clock();
    queue_clock(10, to_time);

    assert.equal(drain_sent(dev).length, 0);
});

test('a start goes out ahead of the first pulse', async () =>
{
    await reset_clock();
    let dev = add_output('dev');

    queue_clock(1, to_time);
    let msgs = drain_sent(dev);

    assert.equal(msgs[0].msg, MSG_START);
    assert.equal(msgs[1].msg, MSG_CLOCK);

    // Devices commonly advance on the first clock after a start, so the two
    // can't share an instant
    assert.ok(msgs[0].time < msgs[1].time);
});

test('the standard rate sends 24 pulses to the beat', async () =>
{
    await reset_clock();
    let dev = add_output('dev');

    // The window is half-open, so the pulse landing on the next beat belongs
    // to that beat rather than to this one
    queue_clock(STEPS_PER_BEAT, to_time);

    assert.equal(sent_of(drain_sent(dev), MSG_CLOCK).length, MIDI_PPQ);
});

test('a rate sends the beat the pulses it is named for', async () =>
{
    for (let idx = 0; idx < CLOCK_RATES.length; ++idx)
    {
        await reset_clock(idx);
        let dev = add_output('dev');

        queue_clock(STEPS_PER_BEAT, to_time);

        assert.equal(
            sent_of(drain_sent(dev), MSG_CLOCK).length,
            rate_ppq(idx),
            `at ${rate_label(idx)}`
        );
    }
});

test('pulses are stamped evenly along the line they were given', async () =>
{
    for (let idx = 0; idx < CLOCK_RATES.length; ++idx)
    {
        await reset_clock(idx);
        let dev = add_output('dev');

        queue_clock(4 * STEPS_PER_BEAT, to_time);
        let clocks = sent_of(drain_sent(dev), MSG_CLOCK);

        for (let i = 0; i < clocks.length; ++i)
        {
            assert.ok(
                Math.abs(clocks[i].time - i * pulse_ms(idx)) < 1e-6,
                `pulse ${i} at ${rate_label(idx)} landed at ${clocks[i].time}`
            );
        }
    }
});

test('a pulse queued over several updates keeps its place in the line', async () =>
{
    await reset_clock();
    let dev = add_output('dev');

    // The scheduler queues a window at a time, and the pulses have to come out
    // the same whether a beat arrives in one window or in twenty.
    //
    // The position is stepped by an exact fraction rather than accumulated: one
    // that drifted by an ulp would drop the pulse sitting on the last boundary,
    // and make this a test about floating point rather than about the clock.
    for (let i = 1; i <= 20 * STEPS_PER_BEAT; ++i)
        queue_clock(i / 20, to_time);

    let clocks = sent_of(drain_sent(dev), MSG_CLOCK);

    assert.equal(clocks.length, MIDI_PPQ);

    for (let i = 0; i < clocks.length; ++i)
        assert.ok(Math.abs(clocks[i].time - i * pulse_ms(DEFAULT_RATE_IDX)) < 1e-6);
});

test('every connected device gets the same clock', async () =>
{
    await reset_clock();
    let first = add_output('first');
    let second = add_output('second');

    queue_clock(STEPS_PER_BEAT, to_time);

    assert.deepEqual(drain_sent(first), drain_sent(second));
});

test('a stop goes out when playback ends', async () =>
{
    await reset_clock();
    let dev = add_output('dev');

    queue_clock(1, to_time);
    drain_sent(dev);
    stop_clock();

    assert.deepEqual(drain_sent(dev).map(m => m.msg), [MSG_STOP]);
});

test('nothing is stopped that was never started', async () =>
{
    await reset_clock();
    let dev = add_output('dev');

    stop_clock();

    assert.equal(drain_sent(dev).length, 0);
});

test('switching the clock off stops what was following it', async () =>
{
    await reset_clock();
    let dev = add_output('dev');

    queue_clock(1, to_time);
    drain_sent(dev);
    disable_clock();

    assert.deepEqual(drain_sent(dev).map(m => m.msg), [MSG_STOP]);

    // And nothing more goes out once it's off
    queue_clock(10, to_time);
    assert.equal(drain_sent(dev).length, 0);
});

test('a device plugged in mid-song is started, and one already running is left alone', async () =>
{
    await reset_clock();
    let first = add_output('first');

    queue_clock(1, to_time);
    drain_sent(first);

    let late = add_output('late');

    // It has missed the start that told the first device to run, so it gets
    // one of its own rather than being left silent
    assert.deepEqual(drain_sent(late).map(m => m.msg), [MSG_START]);

    // The device already running heard nothing about it
    assert.equal(drain_sent(first).length, 0);

    // And a device the browser mentions again is not restarted by it
    announce(late);
    assert.equal(drain_sent(late).length, 0);
});

test('a device plugged in while stopped is not started', async () =>
{
    await reset_clock();
    let dev = add_output('dev');

    queue_clock(1, to_time);
    stop_clock();
    drain_sent(dev);

    let late = add_output('late');

    assert.equal(drain_sent(late).length, 0);
});

test('changing the rate mid-song does not send the clock backwards', async () =>
{
    await reset_clock();
    let dev = add_output('dev');

    // A beat at the rate it starts on, then a beat at each of the others in
    // turn, so that the anchoring is exercised over a move to a slower rate
    // and back to a faster one
    let queued_to = STEPS_PER_BEAT;
    queue_clock(queued_to, to_time);

    let sent = sent_of(drain_sent(dev), MSG_CLOCK);
    let last_time = sent[sent.length - 1].time;

    for (let idx = 0; idx < CLOCK_RATES.length; ++idx)
    {
        set_clock_rate(idx);

        queued_to += STEPS_PER_BEAT;
        queue_clock(queued_to, to_time);

        let after = sent_of(drain_sent(dev), MSG_CLOCK);
        let at = rate_label(idx);

        assert.ok(after.length > 0, `nothing sent at ${at}`);

        // The counter means something different under the new rate, and
        // picking it back up wrongly would repeat a stretch of the clock or
        // skip one
        assert.ok(
            after[0].time > last_time,
            `${at} resumed at ${after[0].time}, already having reached ${last_time}`
        );

        // Only the pulse the rate changed on is allowed to fall at an odd
        // interval, the rest of the beat running at the new spacing
        for (let i = 1; i < after.length; ++i)
        {
            assert.ok(
                Math.abs(after[i].time - after[i - 1].time - pulse_ms(idx)) < 1e-6,
                `uneven pulse ${i} at ${at}`
            );
        }

        last_time = after[after.length - 1].time;
    }

    set_clock_rate(DEFAULT_RATE_IDX);
});

test('switching the clock on mid-song starts it where the song is', async () =>
{
    disable_clock();
    clear_outputs();
    set_clock_rate(DEFAULT_RATE_IDX);
    start_clock();

    // A stretch of the song plays with the clock off
    queue_clock(40, to_time);

    await enable_clock();
    let dev = add_output('dev');
    queue_clock(41, to_time);

    let msgs = drain_sent(dev);

    assert.equal(msgs[0].msg, MSG_START);

    // Started where playback has got to. Counting from the top of the song
    // instead would pour the 40 steps already gone down the wire at once.
    assert.ok(
        msgs[0].time > to_time(39),
        `started at ${msgs[0].time}, with the song at ${to_time(40)}`
    );

    assert.ok(sent_of(msgs, MSG_CLOCK).length <= MIDI_PPQ / STEPS_PER_BEAT + 1);
});

test('the device count is what is currently connected', async () =>
{
    await reset_clock();
    assert.equal(num_outputs(), 0);

    add_output('first');
    assert.equal(num_outputs(), 1);

    add_output('second');
    assert.equal(num_outputs(), 2);
});
