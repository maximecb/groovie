# Groovie

Free, open source web-based beat sequencer with no ads. Implemented in pure JavaScript
with no frameworks.



Supports free-running polymeters.



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
