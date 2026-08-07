import { STEPS_PER_BEAT } from "./model.js";

//============================================================================
// MIDI clock output
//
// Groovie can act as the clock master for outboard gear: a Start message when
// playback begins, a stream of clock pulses while it runs, and a Stop when it
// ends. Everything is broadcast to every connected output, since a device
// that isn't following a clock ignores what arrives.
//
// The pulses are stamped with the time the audio at the same position is heard
// at and handed to the MIDI subsystem ahead of time, the same way samples are
// queued on the audio clock ahead of time (see audio.js). Both come off the
// one position line the scheduler keeps, so the clock can't drift against what
// is playing, and neither is at the mercy of when the main thread next runs.
//============================================================================

// MIDI system realtime messages
const MSG_CLOCK = 0xF8;
const MSG_START = 0xFA;
const MSG_STOP = 0xFC;

// Pulses per quarter note a MIDI clock runs at. Fixed by the MIDI spec: this
// is the number a device counts to work out how fast the master is going.
const MIDI_PPQ = 24;

// Clock rates offered, as the [numerator, denominator] of the ratio each one
// is named by: at 1:1 the clock runs at the 24 PPQ the spec asks for, and at
// num:den it runs at num/den of that.
//
// In principle only the first of these should exist. In practice a fair amount
// of hardware doesn't count pulses the way the spec says to and ends up
// running at some multiple of the tempo it was handed, and slowing the clock
// down is what brings those devices back in time with the page.
//
// The two slowest are slow enough to be a different idea rather than a
// correction: at 4 PPQ a pulse lands on every step of the grid and at 2 PPQ on
// every other one, which is the rate a box counting steps rather than counting
// MIDI clock wants to be fed.
//
// Held as a pair rather than as the divisor it works out to because the ratios
// that are useful aren't all whole numbers, 3:4 being three quarters of the
// standard rate, and because the pair is what the control is labelled with.
// Ordered fastest first, the standard rate being the one to try before any of
// the others.
export const CLOCK_RATES = [
    [1, 1],
    [3, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 6],
    [1, 12],
];

// Index into CLOCK_RATES of the rate to use with a device that follows the spec
export const DEFAULT_RATE_IDX = 0;

// How far ahead of the first pulse the Start message is stamped, in
// milliseconds. Devices commonly advance on the first clock they see after a
// Start, so the two can't share an instant: messages queued for the same time
// aren't guaranteed to leave in the order they were handed over in.
const START_LEAD_MS = 1;

// MIDI access, once the user has asked for the clock and the browser has
// granted it, and null until then. Asking prompts, and somebody opening a link
// to hear a beat shouldn't be asked about their MIDI devices.
let midi_access = null;

// Whether the clock is switched on. Access is kept once granted, so this is
// what the checkbox turns on and off rather than the access itself.
let clock_enabled = false;

// Current clock rate, as an index into CLOCK_RATES
let clock_rate = DEFAULT_RATE_IDX;

// Index of the next pulse to send, counted from the start of playback the way
// the step counter in audio.js is
let next_pulse = 0;

// Whether a Start is owed before the next pulse goes out
let start_pending = false;

// Whether a Start has gone out without a Stop after it, i.e. whether the
// devices out there believe they are running
let clock_running = false;

// Position, in steps, that pulses have been queued up to: everything strictly
// below it has gone out, and a pulse landing exactly on it has not. Changing
// the division mid-playback picks the pulse counter back up from here, a count
// of pulses meaning something different once the pulses move.
//
// Half-open on purpose. A pulse falls on the boundary of a window often enough
// to matter — every rate here divides a beat evenly — and the alternative puts
// that pulse in both of the windows it borders or in neither.
let queued_pos = 0;

// Outputs that have been sent the Start of the current run. A device plugged
// in mid-song has missed that Start and needs one of its own, and this is what
// keeps a state change from restarting everything that already has one.
let started_ports = new Set();

// Called when the set of connected outputs changes, so that the page can say
// what the clock is currently reaching. Null until the page asks.
let outputs_listener = null;

// Whether this browser can send MIDI without something standing in the way.
// The controls are left out of the page where it can't, rather than offered
// and then failing when they're used.
//
// Safari is the easy case: it has no Web MIDI, so there is nothing to call.
//
// Firefox has Web MIDI and still can't have the controls. It gates access
// behind a site permission add-on the user has to install, and when the real
// problem is that no device is plugged in it refuses with that same message
// anyway, after a delay of up to thirteen seconds (see design.md). There is
// nothing this page can do about either, and a checkbox that hangs and then
// blames an add-on is worse than no checkbox.
//
// Firefox is picked out by its user agent because there is no feature test for
// "has this and won't let you use it". That reads its forks as Firefox too,
// which is right: they carry the same gating. A Firefox reporting somebody
// else's agent gets the controls and the refusal, which is where it was before
// this test existed.
export function midi_available()
{
    if (typeof navigator.requestMIDIAccess != 'function')
        return false;

    return !/Firefox\//.test(navigator.userAgent || '');
}

// Whether the clock is currently switched on
export function clock_is_enabled()
{
    return clock_enabled;
}

// How many outputs the clock is currently being broadcast to
export function num_outputs()
{
    return midi_access? midi_access.outputs.size : 0;
}

// The ratio a rate is named by, e.g. "3:4"
export function rate_label(rate_idx)
{
    let [num, den] = CLOCK_RATES[rate_idx];

    return `${num}:${den}`;
}

// Pulses per quarter note sent at a given rate, which is what a device's own
// clock setting is usually labelled in. Every rate here works out to a whole
// number of them, which is what keeps this worth showing.
export function rate_ppq(rate_idx)
{
    let [num, den] = CLOCK_RATES[rate_idx];

    return MIDI_PPQ * num / den;
}

// Register what to call when devices are plugged in or unplugged
export function set_outputs_listener(listener)
{
    outputs_listener = listener;
}

// Turn the clock on, asking the browser for MIDI access the first time.
// Throws if access is refused or unavailable, leaving the clock off.
//
// Access is requested from here, i.e. off the checkbox, rather than at startup:
// browsers ask before granting it, and that is a question for somebody who has
// asked for MIDI rather than for everybody who opens a link.
//
// A refusal is let through rather than reported as a plain false. Every browser
// with Web MIDI gates it differently — a permission prompt in one, a
// site-permission add-on to install in another — so what the browser says about
// the refusal is the only thing that tells the user which of those is in their
// way, and it would be thrown away here.
export async function enable_clock()
{
    if (!midi_available())
        throw new Error('this browser has no Web MIDI');

    if (!midi_access)
    {
        midi_access = await navigator.requestMIDIAccess();

        // Devices come and go while the page is open. The outputs are read
        // fresh on every send, so one plugged in later is broadcast to without
        // any help; what this is for is starting it, playback being under way
        // by the time it arrives.
        midi_access.onstatechange = on_state_change;
    }

    clock_enabled = true;

    // Playback may already be running, in which case the clock joins it where
    // it has got to rather than at the top of the song (see queue_clock)
    start_pending = true;
}

// Turn the clock off, telling whatever was following it to stop
export function disable_clock()
{
    stop_clock();
    clock_enabled = false;
}

// Set the clock rate, as an index into CLOCK_RATES
export function set_clock_rate(rate_idx)
{
    console.assert(rate_idx >= 0 && rate_idx < CLOCK_RATES.length);

    clock_rate = rate_idx;

    // The counter counts pulses, and how far apart pulses sit is exactly what
    // just changed, so the same count now names a different position. Anchor
    // it back to the first pulse of the new rate that hasn't gone out yet, so
    // that moving this mid-playback costs one uneven pulse interval rather
    // than repeating a stretch of the clock or skipping one.
    next_pulse = Math.ceil(queued_pos / pulse_spacing());
}

// Start the clock at the start of playback. The Start message itself goes out
// with the first pulse, that being where there is a time to stamp it against
// (see queue_clock).
export function start_clock()
{
    next_pulse = 0;
    queued_pos = 0;
    start_pending = true;
    started_ports.clear();
}

// Stop the clock at the end of playback.
//
// Sent for the current moment rather than stamped ahead the way the pulses
// are: what stops is meant to stop now. Up to a lookahead window of pulses is
// already queued behind it and will still arrive, which costs nothing, clock
// received while stopped telling a device the tempo rather than to advance.
export function stop_clock()
{
    start_pending = false;

    if (!clock_running)
        return;

    broadcast(MSG_STOP);
    clock_running = false;
    started_ports.clear();
}

// Distance between two pulses, in steps. A step is a quarter note over
// STEPS_PER_BEAT and a pulse is a quarter note over the rate being sent, which
// is the standard rate taken down by the ratio.
function pulse_spacing()
{
    let [num, den] = CLOCK_RATES[clock_rate];

    return STEPS_PER_BEAT * den / (MIDI_PPQ * num);
}

// Queue every clock pulse falling up to a given playback position.
//
// `until_pos` is the position, in fractional steps, that playback has been
// queued up to, and `pos_to_time` maps a position on that same line to the
// time on the performance clock the audio there is heard at. Both come from
// the playback scheduler, so the clock is laid on exactly the line the samples
// are laid on.
//
// Those positions are the unswung ones, deliberately. Swing moves when a step
// is heard without moving the grid it's counted on, and the clock is that
// grid: swinging it would tell the device the tempo itself was wobbling, which
// is why a drum machine sends a straight clock and swings its own voices. The
// delay is held off the swung positions for the same reason (see
// Project.delay_time_secs).
export function queue_clock(until_pos, pos_to_time)
{
    if (!clock_enabled || !midi_access)
    {
        // Keep the anchor up with playback while the clock is off, so that
        // switching it on mid-song starts it where the song is rather than
        // wherever the counter was last left
        queued_pos = until_pos;
        return;
    }

    let spacing = pulse_spacing();

    if (start_pending)
    {
        // Anchor the counter to where playback has got to: the top of the song
        // when playback started the clock, and wherever the song is now when
        // the clock was switched on part way through one.
        next_pulse = Math.ceil(queued_pos / spacing);
        start_pending = false;
        clock_running = true;

        send_start(pos_to_time(next_pulse * spacing) - START_LEAD_MS);
    }

    for (; next_pulse * spacing < until_pos; ++next_pulse)
        broadcast(MSG_CLOCK, pos_to_time(next_pulse * spacing));

    queued_pos = until_pos;
}

// Broadcast one message to every connected output, at a given time on the
// performance clock, or right away when no time is given.
//
// Everything goes everywhere, the way noisecraft does it: a device that isn't
// following the clock ignores what arrives, where picking devices off a list
// is a setup step to put between the user and hearing anything at all.
function broadcast(msg, time)
{
    for (let output of midi_access.outputs.values())
        send_to(output, msg, time);
}

// Broadcast a Start, and note which outputs have had one, so that a device
// arriving later can be told to run without restarting those already running
function send_start(time)
{
    for (let output of midi_access.outputs.values())
    {
        send_to(output, MSG_START, time);
        started_ports.add(output.id);
    }
}

function send_to(output, msg, time)
{
    try
    {
        output.send([msg], time);
    }
    catch (e)
    {
        // A device can go away between the state change that would say so and
        // the next thing sent to it. There is nothing to do about it here: the
        // port is gone, and the state change that follows takes it off the
        // list this walks.
    }
}

// A device was plugged in or unplugged. The outputs are read fresh on every
// send, so a new one is already being broadcast to; what it has missed is the
// Start that told everything else to run.
function on_state_change(event)
{
    if (outputs_listener)
        outputs_listener();

    let port = event.port;

    if (!clock_running || port.type != 'output' || port.state != 'connected')
        return;

    if (started_ports.has(port.id))
        return;

    // Sent for right now rather than on a beat. There is no saying where in a
    // song a device gets plugged in, so it starts from its own beginning here
    // and comes up out of phase with the page; whoever plugged it in can
    // restart playback to line the two up. The alternative is leaving it
    // silent until they work out why, which is worse.
    send_to(port, MSG_START);
    started_ports.add(port.id);
}
