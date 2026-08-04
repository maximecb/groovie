// A stand-in for the parts of the Web MIDI API that midi.js uses, so that the
// clock can be run and looked at without a browser and without any hardware.
//
// The outputs here send nothing: they record what was handed to them, so that
// what a device received is readable after the fact. What the clock is is the
// sequence of messages and the times they were stamped for, and that is all
// this has to keep.

// Access handed to midi.js, once it has asked for it. One object is kept for
// the whole run: midi.js holds onto its access once granted, so a second one
// would never be seen.
let midi_access = null;

// One MIDI output, i.e. one device as far as the page is concerned
class FakeOutput
{
    constructor(id)
    {
        this.id = id;
        this.type = 'output';
        this.state = 'connected';

        // Every message this was sent, in the order it was handed over, as
        // { msg, time } pairs. `time` is the performance-clock time it was
        // stamped for, or undefined where it was sent for right away.
        this.sent = [];
    }

    send(data, time)
    {
        this.sent.push({ msg: data[0], time: time });
    }
}

// Install the fake API. Nothing in midi.js reaches for MIDI while it is being
// imported, so calling this from the body of a test file is soon enough.
//
// The access object is built once however often this is called. midi.js holds
// onto its access once granted, so handing it a second one would leave the
// devices added here somewhere it never looks.
export function install_web_midi()
{
    if (!midi_access)
    {
        midi_access = {
            outputs: new Map(),
            onstatechange: null,
        };
    }

    // Node has a navigator of its own, which is why this is defined over the
    // global rather than assigned into the object already there
    Object.defineProperty(globalThis, 'navigator', {
        value: { requestMIDIAccess: async () => midi_access },
        configurable: true,
        writable: true,
    });
}

// Install a fake API that has no Web MIDI in it, for the code that has to
// decide whether MIDI can be sent at all
export function install_no_web_midi()
{
    Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
    });
}

// Plug a device in, i.e. add an output and tell the page it arrived
export function add_output(id)
{
    let output = new FakeOutput(id);
    midi_access.outputs.set(id, output);
    announce(output);

    return output;
}

// Tell the page about a device without anything having changed about it.
// Browsers report the ports they already have this way as well as the ones
// that arrive, so the page has to hear it about a device it is already sending
// to.
export function announce(output)
{
    if (midi_access.onstatechange)
        midi_access.onstatechange({ port: output });
}

// Unplug a device
export function remove_output(output)
{
    midi_access.outputs.delete(output.id);
    output.state = 'disconnected';
    announce(output);
}

// Unplug every device, without announcing any of it. This is how a test starts
// from no devices rather than from whatever the last one left behind.
export function clear_outputs()
{
    midi_access.outputs.clear();
}

// Take what an output was sent, leaving it with none. Draining rather than
// reading is what lets a test look at one stretch of the clock at a time.
export function drain_sent(output)
{
    let sent = output.sent;
    output.sent = [];

    return sent;
}
