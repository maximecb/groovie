# Groovie

Free, open source beat sequencer that runs in your browser. No ads, no account
required, nothing to install. Written in pure JavaScript with no frameworks and
no backend.

**Try it: https://maximecb.github.io/groovie/**

Sketch a beat in the step sequencer, then arrange your patterns into a song on the
timeline below it. When it sounds right, hit "Copy link": the whole project is encoded
into the hash portion of the URL, so anyone you send the link to can play it and remix
it. Nothing is uploaded anywhere, and there is nothing to sign up for.

## Features

Free-running polymeters. Steps have a fixed duration rather than a fixed number per
pattern, so a 15-step pattern and a 16-step one drift against each other and only line
up again much later. Odd pattern lengths give you grooves that keep evolving instead of
resetting every bar.

- Patterns of 1 to 64 steps and up to 16 rows, up to 64 patterns per project
- Over 150 public domain (CC0) samples: kicks, snares, hats, toms, percussion and
  cymbals, plus vocals, game sounds and assorted noise
- Per-row sample, stereo panning and level in dB
- Tempo from 40 to 280 BPM, plus a swing control
- Patterns can be switched while the music plays: the one you pick is queued and
  launches when the playing one comes around, the way a groovebox does it
- Works on desktop, tablets and phones

## Running it locally

Clone the repo and start a local HTTP server as follows:

```sh
git clone https://github.com/maximecb/groovie.git
cd groovie
./tools/dev_server.py
```

Then open http://localhost:8001. Nothing to install or build, but the page does
have to be served over HTTP: it loads as an ES module and fetches its samples,
which browsers block on `file://`. The server needs Python 3 and sends no-cache
headers, so a reload always picks up your last edit.

## Contributing

The code is distributed under an MIT license, while the samples are under a CC0 license.

We could use more high quality samples. These should be in 44.1KHz 16-bit mono PCM wav format,
and they have to be available under the CC0 license (public domain). We cannot include
copyrighted samples.
You can run `tools/convert_samples.sh` to convert new samples to the expected format,
which the CI will check.

### Running the tests

There is nothing to install. The tests run on the test runner built into Node,
and need Node 22 or later:

```sh
./tools/run_tests.sh
```

The tests cover the project model and the URL encoding in `model.js`, and the
sample library in `audio.js`. Playback and the DOM are not covered, since they
need a browser.

Note that the model states its preconditions with `console.assert`, which only
prints a message in the browser rather than stopping anything. `tests/setup.js`
makes those count as test failures, and `tools/run_tests.sh` loads it ahead of
every test file, so run the tests through that script rather than calling
`node --test` directly.

`tests/encoding.test.js` holds a few golden links. A shared link has to keep
opening as the project it was made from, so a failure there means that
already-shared links now decode differently.

The CI also runs two checks you can run yourself:

```sh
./tools/check_js.sh        # every .js file parses as an ES module
python3 tools/check_samples.py   # sample format, and sample_list.js against the samples
```
