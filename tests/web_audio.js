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
// chain a voice was routed through readable after the fact
class FakeNode
{
    constructor(type)
    {
        this.type = type;
        this.dst = null;
    }

    connect(dst)
    {
        this.dst = dst;
        return dst;
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
