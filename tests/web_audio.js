// A stand-in for the parts of the Web Audio API that audio.js uses, so that
// playback can be run and looked at without a browser.
//
// The nodes here make no sound: they record what was done to them. Starting a
// buffer source is what counts as a voice, so the voices a step queued are the
// sources started while it was being queued, and what a voice was routed
// through is what says where it sits and how loud it is.
//
// audio.js creates its context on first use and then holds onto it, so this
// has to be installed before anything touches the audio. Nothing in that module
// creates a context while it is being imported, so installing this from the
// body of a test file is soon enough.

// How long a decoded sample claims to be. Nothing here plays anything, so this
// is only what a buffer would say if it were asked.
const SAMPLE_DUR = 0.5;

// The context audio.js created, once it has created one
let audio_ctx = null;

// A node that remembers what it was connected to, which is what makes the
// chain a voice was routed through readable after the fact.
//
// A node can feed more than one place, a row sent to the delay going both to
// the output and to the delay's input, so every connection is kept. The one
// that carries the sound onwards is the first: audio.js builds the path a voice
// takes before hanging anything off the side of it.
class FakeNode
{
    constructor(kind)
    {
        // What sort of node this is. Kept apart from `type`, which on a
        // biquad is a real Web Audio property naming the kind of filter it is
        // and would otherwise overwrite this the moment audio.js set it.
        this.kind = kind;
        this.type = kind;
        this.dsts = [];
    }

    connect(dst)
    {
        this.dsts.push(dst);
        return dst;
    }

    // Web Audio's disconnect() with no argument drops every connection the
    // node has, which is what audio.js leans on to route the master gain
    // through the filter or around it
    disconnect()
    {
        this.dsts = [];
    }

    get dst()
    {
        return this.dsts.length? this.dsts[0] : null;
    }
}

// An AudioParam, which audio.js either assigns to or schedules a value on
class FakeParam
{
    constructor(value)
    {
        this.value = value;
    }

    setValueAtTime(value)
    {
        this.value = value;
    }

    // A glide towards a value rather than a step to it. Nothing here models
    // the ramp: what a test can ask is where the param was aimed, which is
    // what the audio graph is deciding.
    setTargetAtTime(value)
    {
        this.value = value;
    }
}

class FakeAudioContext
{
    constructor()
    {
        audio_ctx = this;

        // The clock never runs on its own: a test moves it, so that what gets
        // queued is decided by the test rather than by how long it took to run
        this.currentTime = 0;

        this.destination = new FakeNode('destination');

        // Every voice started since the last time they were taken
        this.voices = [];
    }

    createGain()
    {
        let node = new FakeNode('gain');
        node.gain = new FakeParam(1);

        return node;
    }

    createStereoPanner()
    {
        let node = new FakeNode('panner');
        node.pan = new FakeParam(0);

        return node;
    }

    createDelay(max_delay_time)
    {
        let node = new FakeNode('delay');
        node.maxDelayTime = max_delay_time;
        node.delayTime = new FakeParam(0);

        return node;
    }

    createBiquadFilter()
    {
        let node = new FakeNode('filter');

        // The biquad's own type, which is what `type` means on this node
        node.type = 'lowpass';
        node.frequency = new FakeParam(350);
        node.Q = new FakeParam(1);

        return node;
    }

    createBufferSource()
    {
        let node = new FakeNode('source');
        node.buffer = null;

        node.start = start_time =>
        {
            node.start_time = start_time;
            this.voices.push(node);
        };

        return node;
    }

    // A buffer stands for the file it came from, so that a voice can be asked
    // which sample it is playing. Nothing in audio.js looks inside a decoded
    // buffer or the ArrayBuffer behind it, so the path is passed through in
    // place of the bytes a browser would hand over.
    decodeAudioData(sample_path)
    {
        return Promise.resolve({ path: sample_path, duration: SAMPLE_DUR });
    }

    resume()
    {
        return Promise.resolve();
    }
}

// Put the fake in place of the Web Audio API and of the fetch that loads
// samples through it. Every sample loads, and loads with what it was asked for.
export function install_web_audio()
{
    globalThis.AudioContext = FakeAudioContext;

    globalThis.fetch = sample_path => Promise.resolve({
        arrayBuffer: () => Promise.resolve(sample_path),
    });
}

// The context audio.js is playing through
export function get_ctx()
{
    return audio_ctx;
}

// Take the voices started since they were last taken, leaving none behind, so
// that what a test reads is what the playback it started queued
export function drain_voices()
{
    let drained = audio_ctx.voices;
    audio_ctx.voices = [];

    return drained;
}

// Name of the sample a voice is playing
export function voice_sample(voice)
{
    return voice.buffer.path.match(/samples\/(.+)\.wav/)[1];
}
