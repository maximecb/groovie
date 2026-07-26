# Groovie Design

This will be a beat sequencer, featuring a pattern editor with a step sequencer and
the ability to select samples from a list, as well as a timeline view to arrange
multiple patterns into a song/track.

The web app will have no backend, and will be hosted on GitHub pages. It will be
possible to share tracks/projects by encoding them as part of the hash/fragment
portion of the URL. The web app will be implemented in pure JavaScript without
any web frameworks.

## URL Encoding Scheme

We can easily encode URLs up to 2000+ chars on all browsers
and on Reddit/HN/X, using a base64url encoding scheme. This will allow up to
6000+ bits when encoding projects.

We can use commas to separate values if useful. I think it would make sense
to leave the song title in readable ASCII format, e.g.
`#my_song_title,<base64-encoded-data>`. We can start with a simple encoding
scheme and get gradually more clever with compression to try to shorten the
encoded URLs.

Samples in patterns can be referenced with an integer index, probably
9 bits long (up to 512 samples). The `sample_list.js` file serves as a map
of sample names to sample indices.

Some compression ideas:
- Reuse row M from pattern N, or straight up reuse data from some previous bit index
- Take up to min(16, pat_len) bits of row K from codebook
  - We can use 3 to 6 bits to do our codebook lookup.
- Repeat these 4 bits to fill up to 16 steps.

For the timeline, many patterns are likely to be really sparse, or only on
after a certain number of time steps, then on for some number of steps, and
then off again. It's likely best if we use some kind RLE encoding.

## UI Interface

There are going to be main controls at the top, including a tempo selectable
between 40 and 220 (default 120) and a master volume. The tempo is tied to
the project, but the master volume defaults at 50% when loading a project
to protect end users.

Each pattern has a fixed length between 1 and 64 steps (default 16). To make
phasing between patterns work on the timeline, steps have a fixed duration: the
tempo sets the step rate (a beat is 4 steps, so at 120 BPM there are 8 steps per
second), and every pattern advances through its steps at that same rate.
Shortening a pattern therefore makes it shorter, not slower. Patterns of
different lengths naturally phase against each other, which can be used to create
evolving, polyrhythmic textures.

On the left side of the pattern editor, there will be drop-down boxes to select
the sample associated with each row. On the right side, there will be a stereo
pan knob, adjustable per-row with the mouse.

The timeline view at the bottom will allow arranging patterns into a song, with
one row per pattern. Because steps have a fixed duration, each timeline cell is
as wide as the pattern is long (in steps), and one cell represents one full
playthrough of that pattern. Each cell can be toggled to turn the pattern on or
off at that position. Patterns repeat at their natural step boundary and phase
against each other; lanes only realign at step 0 and at the least common
multiple of their lengths.

The song has an explicit total length in steps (max 4096). Playback runs left to
right and loops back to step 0 at the end, re-syncing all lanes. A pattern whose
length does not divide the song length may have its final repetition clipped at
the loop point; a "fit to content" helper can set the song length to the end of
the last active cell to avoid this. Very short patterns produce many narrow cells
on their row, which a timeline zoom control can accommodate.

There should be both a global play/stop button that plays the whole song/timeline
sequence, and a local play/stop button that allows playing individual patterns
while editing them. However both cannot play at the same time. Pressing the
spacebar while nothing is playing will trigger song playback.

The layout should ideally be responsive and be able to adapt to desktop,
phones and tablets.

## Future Features

It would be desirable to have a hit counter (can we find a free provider?)

We might also want to have the ability to project to `.wav` file. The processing
for that should be done 100% locally on the client.
