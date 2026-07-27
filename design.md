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

The timeline is encoded one lane at a time, right after the pattern the lane
places. Lanes are sparse: a pattern is off for most of a song, and where it's
on it tends to be on for several cells in a row, so a lane is written as a
series of blocks of consecutive active cells, each written as the gap before it
followed by its own length, ending with an empty gap. A pattern not placed on
the timeline at all costs a single bit.

Those values are written in 4-bit chunks, each preceded by a bit saying whether
a chunk follows, so that short songs don't pay for the length fields a long one
needs. Zero takes no chunks and so costs a single bit, which every other value
pays one bit for. That trade is worth it because zero is by far the most common
value here: it ends every lane, it's the gap of a lane starting on the first
bar, and, since a block always holds at least one cell and is written one lower,
it's the length of every single-cell block. On a 32-bar arrangement of eight
patterns, this costs 112 bits for the whole timeline, against 136 for the same
scheme without the cheap zero.

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

Above the pattern editor is a strip of numbered tabs, one per pattern, which is
how patterns are created, selected and deleted. Clicking a tab opens that
pattern for editing; buttons at the end of the strip create an empty pattern or
a copy of the current one. New patterns take their samples and length from the
pattern that was open, since samples belong to pattern rows and a song is
usually played with one kit. Patterns are always added at the end, so that
creating one never renumbers the patterns that exist. Deleting a pattern does
renumber the ones after it, which anything referring to patterns by index (the
timeline, playback) has to account for.

While a pattern is playing, selecting another one does not cut it off: the
selected pattern is opened for editing right away, but is only launched once
the playing pattern reaches the end of its cycle, and it starts from its own
first step. The tab strip shows which pattern is being heard and which is
queued behind it. Selecting the pattern already playing cancels a pending
launch.

On the left side of the pattern editor, there will be drop-down boxes to select
the sample associated with each row. On the right side, there will be a stereo
pan knob, adjustable per-row with the mouse.

The timeline view at the bottom arranges patterns into a song, with one lane per
pattern. Because steps have a fixed duration, each timeline cell is as wide as
the pattern is long (in steps), and one cell represents one full playthrough of
that pattern. Each cell can be toggled to turn the pattern on or off at that
position. Patterns repeat at their natural step boundary and phase against each
other; lanes only realign at step 0 and at the least common multiple of their
lengths. A lane is labelled with the number of the pattern it places, and that
label also opens the pattern for editing.

The song has no length of its own: it ends where the last pattern placed on the
timeline stops playing, rounded up to a whole bar so that the loop lands on a
bar boundary even when the patterns don't. The timeline shows some empty room
past that end to place the next pattern into, so making the song longer is a
matter of placing a pattern further right, and removing the last pattern makes
it shorter again. Playback runs left to right and loops back to step 0 at the
end, re-syncing all lanes. A song can be at most 4096 steps long, and a pattern
reaching that limit may have its final playthrough clipped at the loop point.
Above the lanes is a ruler numbering the bars, since the cells of a pattern that
isn't a whole number of bars long don't line up with them. Very short patterns
produce many narrow cells on their lane, which a timeline zoom control could
accommodate later on.

There are both a global play/stop button that plays the whole song/timeline
sequence, and a local play/stop button that allows playing individual patterns
while editing them. Both cannot play at the same time: starting either one ends
whatever was playing. The spacebar plays and stops the song. Song playback has
several patterns sounding at once, so there is nothing one pattern grid can
usefully show: the timeline playhead is what says where playback is, and the
pattern editor stays out of it.

The layout should ideally be responsive and be able to adapt to desktop,
phones and tablets.

## Future Features

It would be desirable to have a hit counter (can we find a free provider?)

We might also want to have the ability to project to `.wav` file. The processing
for that should be done 100% locally on the client.
