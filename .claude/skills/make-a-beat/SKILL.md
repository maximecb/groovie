---
name: make-a-beat
description: Write a playable Groovie song and hand back a link to it. Use whenever someone asks for a beat, a groove, a drum pattern, or a whole track — "make me a psytrance beat", "write a hip hop loop", "generate a song", "give me something to start from" — or asks to change one you already made ("busier hats", "swing it more", "make it longer").
---

# Make a beat

You write the song out as a file, a tool turns it into a link, and the person
opens the link and tells you what to fix. You cannot hear what you wrote, so
treat the first link as a draft you are asking them to react to, not as a
finished track.

## 1. Ask what they want

Ask for genre or style, the kinds of sounds, roughly how long, and how busy.
Say that vague answers are fine. One round of questions, not an interrogation.

If they already said enough to start — skip the questions and build it.
Missing details are yours to choose, and a
draft they can react to beats a questionnaire.

## 2. Read the reference before writing anything

`tests/corpus.js` is the reference for the format and for what a good song
looks like in it. Do not read the whole file, it is ~1400 lines.

- Read lines 1–110: the format documentation and the lane helpers.
- `grep -n "name: " tests/corpus.js` to see what songs are in there.
- Read the one or two nearest what was asked for, comments included. They
  explain the musical intent, which is the part worth copying.

## 3. Pick samples by name

There are 151, and the names say what they are. `sample_list.js` is the list:

```
kick(14) snare(14) hat_closed(6) hat_open(5) tom_hi/mid/low(5 each) clap(4)
rimshot(4) perc(4) bongo(4) cymbal(4) zap(5) punch(6) crash(2) ride(2)
claves(2) cowbell(3) maracas(2) glitch(2) twang(3) melee(3) metal(2) glass(2)
kick_distort(2) snare_distort(2) hat_metal(1) hat_distort(1) beep(2) game_*(9)
vocal_*(11, e.g. vocal_what_01, vocal_come_on, vocal_scream) crow(2) door(2)
anvil alarm heartbeat formant warb ratchet lock notify
```

Numbered variants of one family sound different — audition by picking a
plausible one, and offer to swap it if they don't like it. A name that isn't in
the list is a hard error from the tool, so grep before guessing.

## 4. Write the song to a temp file

Put it in `${TMPDIR:-/tmp}/groovie-songs/<slug>.js`, creating that directory if
it isn't there. A song is a draft on the way to a link rather than something
the project keeps: the link carries the whole song, so once it is printed there
is nothing in the file worth holding on to.

Write it nowhere inside the repo. In particular never add songs to
`tests/corpus.js` — that file is the yardstick the URL encoding is measured
against, and padding it with generated songs ruins the measurement.

Use the same path for the whole conversation so that a revision is an edit
rather than a new file. If they want to keep a song, say that the link is the
song, and offer to save the file somewhere they choose.

The shape, which is the corpus shape:

```js
export default {
    name: 'a rolling psytrance loop',   // becomes the title in the link
    tempo: 145,
    swing: 50,                          // optional, 50 is straight
    humanize: 0,                        // optional, 0 is dead on the grid
    delay_time: 19,                     // optional, index into DELAY_STEP_FRACTIONS
    delay_feedback: 35,                 // optional, multiples of 5
    song_bars: 16,
    patterns: [
        {
            samples: ['hat_closed_04', 'perc_02', 'kick_09'],
            rows: [
                //  bar 1              bar 2
                '..x...x...x...x.' + '..x...x...x...x.',
                '....x.......x...' + '....x.......x...',
                'x...x...x...x...' + 'x...x...x...x...',
            ],
            pans: [6, -7, 0],           // optional, -10 to 10
            volumes: [-10, -13, 0],     // optional, dB, 0 to -30
            sends: [-30, -8, -30],      // optional, dB to the delay, -30 is dry
            lane: 'xxxxxxxx',           // one character per playthrough
        },
    ],
};
```

Conventions worth following, all of them from the corpus:

- One row per sample, and they read top to bottom the way the editor draws
  them: cymbals and hats up top, kick at the bottom.
- Write grids a bar at a time, `'....'` + `'....'`, with a
  `//  bar 1              bar 2` comment above. A 16-step bar is readable; a
  64-character string is not.
- `lane` is one character per *playthrough of that pattern*, not per bar. A
  32-step pattern in a 32-bar song has 16 cells. `lane_from_bar` and
  `lane_over_bars` from the corpus are importable when a lane is awkward to
  write out.

## 5. Make sure the dev server is up

Check it, and start it if it isn't:

```sh
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/index.html
```

`200` means it's serving and you're done. Anything else — `000`, a connection
error — means start it, **in the background** so it keeps running:

```sh
./tools/dev_server.py
```

Run that with the Bash tool's background mode. It never exits on its own, so
running it in the foreground hangs the session. Give it a second, then curl
again to confirm before handing over a localhost link.

If the port is taken by something that isn't Groovie, the script exits with
`Address already in use`. Say so and hand over the public link only, rather
than a local link that opens someone else's page.

## 6. Build the link

```sh
node tools/make_song.js "${TMPDIR:-/tmp}/groovie-songs/<slug>.js"
```

It prints a local link and a public one, and refuses to print anything if the
song can't be encoded. The errors say what to fix — an unknown sample, rows of
different lengths, a level out of range, lanes that don't add up to the
`song_bars` you claimed. Fix and re-run; never hand over a URL you assembled
yourself, the fragment is bit-packed and cannot be written by hand.

## 7. Hand it over and iterate

Give them both links, say what you were going for in a sentence or two, and ask
what to change. Then edit the same file and re-run — keep the song on disk so
each round is a small edit rather than a fresh start.

## Reference values

| what | range | notes |
|---|---|---|
| tempo | 40–280 | |
| swing | 50–75 | 50 straight, 54–58 subtle, 60–66 a real shuffle |
| humanize | 0–31 | 0 machine-tight, 6–12 a played feel, 20+ audibly loose |
| pattern length | 1–64 steps | 16 steps = 1 bar |
| rows per pattern | up to 16 | |
| patterns | up to 64 | |
| pan | -10 to 10 | 0 centre |
| volume | -30 to 0 dB | 0 is untouched, -30 silent |
| send | -30 to 0 dB | -30 is dry, which is the default |
| delay feedback | 0–75 | multiples of 5 |
| delay time | index 0–31 | 8 = 1 step, 14 = 2, 19 = 3 (dotted eighth), 21 = 4 |
| link | under 2000 chars | the tool checks |

Tempos that sound right: hip hop 85–95, dub techno 120–125, house 120–128,
techno 130–140, UK garage 130–140 with swing 60+, breakbeat 130–140, psytrance
143–148, drill and bass 160–170, drum and bass 172–176.

Mixing that doesn't fight itself: kick at 0, snare around -3, hats -8 to -14,
percussion -10 to -18. Keep kick and snare near the centre (0 to ±3) and pan
hats, percussion and effects wide (±5 to ±10). Sends around -20 are a hint,
-10 is audible, -4 is a dub effect.

## Making it sound like an arrangement

A single pattern looping is a loop. What makes the corpus songs read as songs:

- Two or three patterns that tile the timeline, one being the main groove and
  another a busier variant that takes over for a few bars. Interlocking lanes
  (`'xxxxxxxx....xxxx'` against `'........xxxx....'`) are how a middle section
  or a fill is built.
- A layer whose length doesn't divide the bar — a 48-step or 12-step percussion
  pattern over 16-step drums — drifts against the groove and comes back into
  line every few bars. `'a 32 bar two step arrangement'` and
  `'a 64 bar psytrance arrangement'` both do this.
- Rows dropping out. Lanes that start at bar 8 rather than bar 0 give the song
  an intro for free.
