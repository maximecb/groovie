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

The data opens with a version number, which is what lets the format gain a
field without the links already shared losing their meaning. A reader that
guessed wrong about which fields a link carries would not fail, it would open
the link as a different song, so a new field steps the version and the reader
keeps a branch for every version there has been. Version 1 is what added the
filter; version 0 links are still read, and open as the projects they always
did with a filter sitting at its centre doing nothing.

Every link the encoding has been pinned to is kept in `tests/golden_links.js`,
a list that only ever grows. The ones naming a song in the corpus are checked
against that song in both directions, which is what catches a decoder that has
started reading an old link as a different one. The ones naming nothing are
links that were shared before they were written down, and are held to a round
trip instead, there being no hand-written project to compare them against.

Samples in patterns can be referenced with an integer index, probably
9 bits long (up to 512 samples). The `sample_list.js` file serves as a map
of sample names to sample indices.

What a link mostly holds is pattern rows, so that is where the compression is.
A row is written as a guess at the sample it plays, its cells, and guesses at
where it sits in the stereo field and how loud it is.

Each guess is the row at the same index of the previous pattern written,
falling back to what a row starts out as when there is no previous pattern: the
sample its index was handed from the default kit, the centre, and full level.
Each costs a single bit when it's right. Patterns are made by copying one
another and a kit is usually left alone once assembled, so for most rows of
most projects every guess is right, and a project on the untouched default kit
pays one bit per row for its samples rather than nine.

The cells are written in whichever of four schemes is shortest, named by a
two-bit field in front of them:

- Flat, one bit per step.
- A short cell of 2, 4, 8 or 16 steps repeated to the end of the row. The cell
  doesn't have to divide the row: it is cut wherever the row ends.
- Groups of 8 steps, the first written out and each one after it preceded by a
  bit saying whether it is the same as the group before it.
- The same, in groups of 16.

The repeated cell is what holds a row that is the same all the way through, and
the groups hold one that repeats but varies somewhere, which a repeated cell
can't express at all: three identical half bars and a fill on the fourth is the
most common shape there is. Measured over `tests/corpus.js`, the four together
write the cells of a song in 40% fewer bits than one bit per step, against 24%
for the repeated cell alone and 34% for the groups alone.

A scheme is only ever chosen when it comes out shorter, and the flat scheme is
always available, so the two-bit field is the most this can cost a row.

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
between 40 and 280 (default 120) and a master volume. The tempo is tied to
the project, but the master volume defaults at 45% when loading a project
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
the sample associated with each row. On the right side of each row is a stereo
pan control, reading out where the row sits the way a mixer labels it (`L60`,
`C`, `R30`) and returning to the centre when double-clicked. It is a slider
rather than the knob originally planned: the page is built out of sliders
already, and a slider can be dragged, tabbed to and arrowed along without any
of the pointer handling a knob needs to turn a drag into an angle.

Beside it is a level control, reading out in decibels below the sample as
recorded, with the bottom of its travel silent rather than merely quiet so that
pulling a row down mutes it. Decibels rather than a percentage because that is
how loudness is heard: a step of one decibel is about the smallest change
anyone can hear, so every setting in the range is one that can be told from its
neighbours, where a percentage spread over the same number of settings would
put most of them between 90% and 100% where none of them can.

Beside that again is a delay send, in the same decibels and with the same
bottom-is-off rule. It is a send rather than a wet/dry mix: the row itself
always reaches the output at full level, and this says how loud a copy of it is
fed to the delay, whose echoes are added on top. A drum is never replaced by
its own echo, which is what a mix control at the top of its travel would do, so
the only thing worth controlling is how much echo sits behind it. The copy is
taken after the row's level and panning, so echoes sit where the row sits and
come down with it as it is turned down.

All three belong to the row rather than to the sample, so the same sample can be
placed and set three ways in three patterns. It rarely is — a kit is mixed once
and left alone — which is what the encoding above is built to expect. A new
pattern takes the panning, levels and sends of the one it was made from, for the
same reason it takes its samples.

At the end of a row is the button that removes it. A pattern always keeps one
row, so the button is left off a pattern that is down to its last.

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
end, re-syncing all lanes. A song can be at most 16384 steps long, and a pattern
reaching that limit may have its final playthrough clipped at the loop point.
Above the lanes is a ruler numbering the bars, since the cells of a pattern that
isn't a whole number of bars long don't line up with them. Very short patterns
produce many narrow cells on their lane, which a timeline zoom control could
accommodate later on.

There are both a global play/stop button that plays the whole song/timeline
sequence, and a local play/stop button that allows playing individual patterns
while editing them. Both cannot play at the same time: starting either one ends
whatever was playing. The spacebar plays and stops the song, and P and T are
shortcuts for the pattern and timeline buttons themselves. Song playback has
several patterns sounding at once, so there is nothing one pattern grid can
usefully show: the timeline playhead is what says where playback is, and the
pattern editor stays out of it.

The page is laid out in one column that follows the width of the window up to a
cap, rather than at a width of its own. The cap is set to what the page has the
contents to fill rather than to what the grids could use, since past it the
boxes stretch further than what is in them; it is worth raising as the page
gains more to hold. The timeline draws as many bars as fit across whatever width
it ends up with, so that the room to make the song longer is on the lanes rather
than off the end of them.

Under the grids, the smaller groups stand on a row that wraps: as many side by
side as there is room for, and a column when there isn't. What is added there
later, such as exporting a track, lands beside what is already there instead of
below it. The delay's own settings were the first thing to have gone there,
with the filter's beside them.

## Delay

There is one delay for the whole project, which rows feed through their own
sends, the way a mixer has one effect on a bus rather than one per channel. Two
rows echoing at different times is not what a delay is for, and a project's
worth of them is a project's worth of delay lines to run. Its settings belong to
the project rather than to a pattern for the reason swing does: the delay is set
in steps, and the step grid is the song's rather than any one pattern's.

The time is set in fractions of a step rather than in milliseconds, so that it
follows the tempo: an echo written at 120 BPM is still on the beat when the same
song is played at 140. The control runs along a table of 32 settings, and it is
a slider rather than a drop-down so that it can be worked during playback —
sweeping it re-reads a ringing line at a new rate and bends the pitch of what is
still in it, which is what a delay has always done when its time is changed.

Fractions below one step matter as much as whole ones. A step is 125 ms at 120
BPM, and the shortest delays worth having are all under that: a quarter of a
step doubles a hit and thickens it, half a step is the slapback that sits on
snares and claps, and an eighth of a step reads as stereo width rather than as
an echo at all. The middle of the range, from one step to four, is spaced the
finest, since that is where an echo is heard as a rhythm of its own. The odd
ratios there are not filler: a delay set to five quarters of a step drifts
against the pattern it sits on the same way patterns of different lengths drift
against each other.

Swing is deliberately not accounted for. It moves when a step is heard without
moving the grid the steps are counted on, and the delay is set against that
grid, which is what a delay synced to a drum machine's clock does. Echoes land
on the straight positions of the grid even while the pattern above them swings.

Feedback tops out well short of unity, where a loop stops decaying and starts
building on itself without bound. That is a ceiling on the range rather than a
clamp applied afterwards, so there is no setting a project can hold or a link
can carry that runs away. Every pass through the loop is also rolled off above
a few kilohertz, which is not exposed as a control: drums are almost entirely
transient, and a feedback loop with nothing damping it stacks those transients
into a bright hash within three or four repeats.

The delay is left running when playback stops, so a tail rings out rather than
being cut off mid-repeat, and it sits on the master gain like any other voice,
so the master volume brings the echoes down with everything else. Its nodes are
built on first use, so a project that sends it nothing never builds them.

## Filter

There is also one filter for the whole project, and unlike the delay it has no
per-row send at all. A send is for an effect that is added to what a row
already plays; a filter replaces it, so a send-and-return would need a wet/dry
mix on every row and the dry path would undo the thing the filter is for. What
this is for is the filter on a DJ mixer: one control across the whole track,
swept during a breakdown. Per-row filtering is timbral shaping, which belongs
to the sample rather than to the sequencer.

It sits after the master gain, so it takes the delay's echoes with it and a
sweep darkens a ringing tail rather than leaving it untouched behind the track.
That also keeps it outside the delay's feedback loop, where sweeping it could
otherwise change how much the loop returns.

It is set with a single control rather than with a mode and a cutoff. The
centre does nothing; moving off it one way brings a low-pass down over the
track and the other way brings a high-pass up under it, and the distance from
the centre is how much is being taken away whichever way it was moved. One
control because the thing this is for is a gesture rather than a setting:
having to stop and change mode halfway through a sweep is what a pair of radio
buttons would cost. Both directions run over the same band, from under the
lowest note anything in a kit is pitched at to past where a cymbal has anything
left, spaced logarithmically because that is how the ear spaces frequencies.

The travel either side of the centre is fine enough that a sweep by hand steps
by about a semitone at a time, which is what keeps it from sounding like a
control being clicked through positions. The readout names which kind of filter
is running and where it is set, so a sweep can be read while it happens, and
the centre reads as off rather than as a frequency, the way the centre of the
pan control reads as C. Double-clicking returns it there.

At the centre the filter is bypassed rather than opened all the way: a digital
filter keeps some of its rolloff however far it is opened, and a project that
isn't using one should pay nothing for it. A project that never sweeps one
never builds one at all.

Two things about a filter can only be stepped rather than glided: whether it is
in the graph, and which kind of filter it is. Neither is ever done while it can
be heard. Instead the master gain feeds three paths — a dry one, a low-pass and
a high-pass — and the control fades between them. Nothing is connected,
disconnected or retyped once the paths exist, so there is no step left to
click. The usual objection to a crossfade doesn't apply here: near the centre
the filtered path is barely filtering, so the paths carry very nearly the same
signal, and two copies of the same signal faded between sum to themselves.

The resonance also fades out towards the centre, which is what makes that true
at any setting. Hard over one way the peak is at 18 kHz where nobody can hear
it, but the other way it is at 30 Hz sitting on the bass, and a path carrying
that is not a path the dry one resembles. It costs nothing musically: near the
centre the filter is barely filtering, and a peak on a corner that isn't
cutting anything is not what resonance is for.

Everything that can be glided is. The corner and the resonance are ramped to
over a few milliseconds rather than set outright, which is the opposite of what
the delay time does and for the opposite reason: stepping a delay time bends
the pitch of what is still in the line, which is a sound worth having, while
stepping a filter's coefficients discontinues its output. The more resonance it
carries the more energy is sitting in its memory to be discontinued, so an
un-ramped sweep clicks its way across the band, worst exactly where the control
is most worth using. The path that is currently silent is set outright rather
than glided, and is kept at the setting the control passed through, so that it
has nothing to catch up on the next time it is faded in.

What is left after all of that is not a defect to chase. Sweeping a resonant
filter quickly across the band moves a lot of stored energy through it, and it
is supposed to be audible: that sound is most of what a filter sweep is.

It is built out of two biquads in series rather than one. A single biquad
rolls off at 12 dB per octave, which is gentle enough that a sweep sounds like
the track is being covered up rather than filtered: there is always an octave
of what was just cut still audible under the corner. Two stages give the 24 dB
per octave that the filters people know the sound of are built at.

Resonance is a peak at the corner, running from a response with no peak at all
up to a cap. The cap is a ceiling on the range rather than a clamp applied
afterwards, for the reason the delay's feedback ceiling is: a peak is a boost
like any other, the setting arrives in a link somebody else made, and a mix
already near the top of its range has nowhere to put another 18 dB. It reads as
a percentage of its travel rather than as the Q it works out to, there being no
unit here that carries meaning the way decibels do on the levels.

The two stages are not the same filter twice. Cascading identical stages would
square the response and so square the peak, which at the top of the range would
be around 36 dB rather than 18. So they are split by job: the first is fixed at
the Q that holds the pair maximally flat, and the second is the one resonance
moves. A biquad passes its own corner at a gain of exactly its Q, so what the
pair does there is the product of the two, which is what the resonance control
actually sets and what the cap is a cap on. At the bottom of the range the two
sit on the pole Qs of a fourth-order Butterworth and the pair passes its corner
at the -3 dB that defines one.

Unlike the delay, the filter does not follow the tempo. It is set in hertz, and
a song played faster is the same song through the same filter.

A screen too narrow to hold a row's steps and its place in the mix at once,
which is any phone held upright, gets the steps, and a button below the grid
swaps them for the mix. One or the other rather than both: the steps of a
pattern are already wider than the screen and scroll sideways, so controls kept
past the end of them would be controls nobody could find. Nothing is dropped on
a phone, only shown one part at a time.

## Future Features

[DONE] It would be desirable to have a hit counter (can we find a free provider?)

We might also want to have the ability to project to `.wav` file. The processing
for that should be done 100% locally on the client.
