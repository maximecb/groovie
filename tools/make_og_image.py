#!/usr/bin/env python3

"""Builds og_image.jpg, the picture that shows up when a link is shared.

Social media and chat apps read the picture named by the og:image tag in
index.html, and they don't run JavaScript or read SVG, so this is a flat
bitmap committed to the repo rather than anything drawn at load time.

Two files come out. The JPEG is the one index.html points at: the picture has
to be fetched before the card can be drawn, and the same picture as a PNG is
close to five times the bytes, since a PNG stores every one of the scanlines
exactly. The PNG is kept because links shared before this changed still ask
for it, and a card whose picture 404s is shown as a bare link.

The picture is the logo over a step sequencer grid playing a plain four-four
beat, in the colours the app draws patterns in. There is no text in it beyond
the logo: what a preview says comes from the og:title and og:description tags,
where it stays selectable and translatable, and where it doesn't have to be
rendered in whatever font happens to be installed.

Rasterising is done by Chrome in headless mode, which is the one renderer on
hand that draws an SVG at the size it was drawn at. The obvious alternative on
macOS, qlmanage, is a thumbnailer rather than a renderer: it fits the drawing
into a square of its own choosing and crops whatever hangs off, which quietly
loses the right hand side of a wide picture.

Run it after changing the logo or the palette:

    ./tools/make_og_image.py
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LOGO = REPO / 'logo.svg'
OUT_PNG = REPO / 'og_image.png'
OUT_JPG = REPO / 'og_image.jpg'

# What every social network asks for. Anything near this ratio is shown
# uncropped by X, Facebook, Messenger and Signal alike.
WIDTH = 1200
HEIGHT = 630

# Colours the app draws with, from view.js and style.css. A row of the grid is
# drawn in the colour its pattern would be, so the picture and the app agree.
#
# The background is a hair off black rather than black. Scanlines work by
# taking light away, so on a truly black field there is nothing for them to
# take and they only show where the picture is already lit. Lifting the floor
# a little gives them something to bite on everywhere.
BACKGROUND = '#0d1117'
CELL_OFF_BORDER = '#666666'

# One row per colour, each with the part a kit piece would play. Read together
# they are an ordinary four-four beat, which is what makes the picture legible
# as a sequencer rather than as an abstract grid.
#
# The lit colours are the app's hues pushed up in brightness and saturation.
# A preview is looked at small, on a feed full of other pictures, and the
# palette the editor uses at full size goes muddy there. Each lit cell also
# gets a bloom of its own colour, which is what a bright thing does on a tube.
ROWS = [
    ('#ff3b1a', 'x...x...x...x...'),   # kick
    ('#ffdd00', '....x.......x...'),   # snare
    ('#00fff0', 'x.x.x.x.x.x.x.x.'),   # closed hat
    ('#a259ff', '..x...x...x...x.'),   # a perc line off the beat
]

# Grid geometry. A beat is four steps, and the gap between beats is wider than
# the gap between steps, the way the editor spaces them.
CELL = 44
STEP_GAP = 8
BEAT_GAP = 16
ROW_GAP = 10

# The tagline under the grid, in the app's own words. It is burnt into the
# picture as well as being in the og:description tag: a preview card is often
# shown with the description cut off or dropped, and this is the line that
# says what the thing is.
TAGLINE = [
    'THE MOST ADVANCED DRUM MACHINE ON THE WEB.',
    'OPEN SOURCE, NO ADS, 100% FREE.',
]
TAGLINE_FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif'
TAGLINE_SIZE = 38
TAGLINE_LEAD = 50

# How tall a capital stands as a fraction of the font size. Helvetica's is
# 0.717, and the tagline is all capitals, so this is the height the block of
# text actually occupies: laying it out by the font size instead would leave
# it sitting visibly low, since most of the slack in a font is under it.
CAP_RATIO = 0.717

# Where the logo's ink starts and stops inside its own 212 unit box, measured
# off a render of it rather than read off the paths, because what the eye
# lines up against is the glow around the letters and not the letters. The
# box is taller than the drawing at both ends to give that glow somewhere to
# go, and spacing the picture by the box rather than by these leaves the logo
# looking like it is floating too low.
LOGO_INK_TOP = 36
LOGO_INK_BOTTOM = 189

# The scanlines. A dark line every SCANLINE_PITCH pixels, the way a tube draws
# with a gap between the rows it lights. Two pixels dark in four reads as a
# screen; anything finer turns to grey once a feed rescales the picture.
#
# How dark those two pixels are is a tax on the whole picture, and it is paid
# twice. A feed does not show the picture at the size it was drawn: Facebook
# takes it to 1000x522, and once the lines are below a pixel each they stop
# reading as lines and just come out as a veil over everything. Taking 30
# percent rather than 42 still reads as a tube up close and leaves the colours
# with enough left in them to survive the rescale.
SCANLINE_PITCH = 4
SCANLINE_DARK = 0.30

# The wash across the face of the tube, brightest in the middle. This is a
# screen blend, so what it really does is lift the black the picture sits on,
# and it was doing it hard enough to be the main reason a shared card came
# back looking washed out: the background under the logo was arriving at
# roughly (27, 37, 47) instead of the near black it is drawn on. Enough of it
# is kept for the middle to read as lit; the rest went.
TUBE_GLOW_CORE = 0.07
TUBE_GLOW_MID = 0.03


def grid_width():
    """How wide the grid comes out, so it can be centred on the canvas."""
    num_steps = len(ROWS[0][1])
    width = num_steps * CELL + (num_steps - 1) * STEP_GAP

    # Every beat but the first is pushed out by the wider gap before it
    return width + (num_steps // 4 - 1) * (BEAT_GAP - STEP_GAP)


def cell_x(step_idx):
    return step_idx * (CELL + STEP_GAP) + (step_idx // 4) * (BEAT_GAP - STEP_GAP)


def logo_markup():
    """The logo's own drawing, to be dropped into the canvas.

    It is inlined rather than linked because a renderer given an <image> tag
    pointing at an SVG may or may not follow it. The gradients inside are in
    the logo's coordinate system, which a wrapping transform carries with it,
    so they keep sweeping across the word rather than across each letter.
    """
    svg = LOGO.read_text()

    body = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.DOTALL)
    if not body:
        sys.exit(f'error: could not read the drawing out of {LOGO.name}')

    size = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    if not size:
        sys.exit(f'error: {LOGO.name} has no viewBox to size it by')

    return body.group(1), float(size.group(1)), float(size.group(2))


def defs_markup():
    """The bloom filters and the tube overlays, one per thing that needs one.

    A filter per row colour rather than one shared one: feDropShadow takes the
    colour it spreads as an attribute, not from what it is applied to, so a
    shared filter would bloom every row in the same colour.
    """
    out = ['<defs>']

    for row_idx, (color, _) in enumerate(ROWS):
        # The region is grown well past the shape, because the default box
        # clips at ten percent and the bloom is wider than the cell it leaves.
        out.append(
            f'<filter id="bloom{row_idx}" '
            f'x="-150%" y="-150%" width="400%" height="400%">'
            f'<feDropShadow dx="0" dy="0" stdDeviation="9" '
            f'flood-color="{color}" flood-opacity="0.95"/>'
            f'<feDropShadow dx="0" dy="0" stdDeviation="22" '
            f'flood-color="{color}" flood-opacity="0.55"/>'
            f'</filter>'
        )

    # The scanlines, as a tile the height of one line pair rather than as a
    # thousand rects. shape-rendering keeps the edges hard: left to antialias
    # them the pattern turns into a flat wash at this pitch.
    out.append(
        f'<pattern id="scanlines" width="{SCANLINE_PITCH}" '
        f'height="{SCANLINE_PITCH}" patternUnits="userSpaceOnUse">'
        f'<rect width="{SCANLINE_PITCH}" height="{SCANLINE_PITCH / 2}" '
        f'fill="#000000" fill-opacity="{SCANLINE_DARK}" '
        f'shape-rendering="crispEdges"/>'
        f'</pattern>'
    )

    # The bloom off the face of the tube: a cool wash that is brightest in the
    # middle and gone by the edges, laid over everything in screen mode.
    out.append(
        '<radialGradient id="tubeGlow" cx="50%" cy="46%" r="72%">'
        f'<stop offset="0%" stop-color="#6fd8ff" '
        f'stop-opacity="{TUBE_GLOW_CORE}"/>'
        f'<stop offset="45%" stop-color="#4aa6ff" '
        f'stop-opacity="{TUBE_GLOW_MID}"/>'
        '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>'
        '</radialGradient>'
    )

    # And the dark at the corners, which is the other half of a tube looking
    # like a tube: the picture has to fall off where the glass curves away.
    out.append(
        '<radialGradient id="vignette" cx="50%" cy="50%" r="78%">'
        '<stop offset="62%" stop-color="#000000" stop-opacity="0"/>'
        '<stop offset="100%" stop-color="#000000" stop-opacity="0.45"/>'
        '</radialGradient>'
    )

    # The tagline gets a bloom too, for the same reason the cells do: the
    # scanlines cut a fifth out of everything they cross, and white text is
    # the one thing in the picture that has to still look white afterwards.
    out.append(
        '<filter id="textBloom" x="-40%" y="-140%" width="180%" height="380%">'
        '<feDropShadow dx="0" dy="0" stdDeviation="3" '
        'flood-color="#ffffff" flood-opacity="0.60"/>'
        '<feDropShadow dx="0" dy="0" stdDeviation="10" '
        'flood-color="#ffffff" flood-opacity="0.34"/>'
        '<feDropShadow dx="0" dy="0" stdDeviation="26" '
        'flood-color="#9fd8ff" flood-opacity="0.26"/>'
        '</filter>'
    )

    out.append('</defs>')

    return out


def build_svg():
    logo, logo_w, logo_h = logo_markup()

    # Three bands down the picture: logo, grid, tagline. The four gaps around
    # them -- above the logo, between each pair, and below the tagline -- are
    # all the same, and rather than being picked by eye they are what is left
    # of the height once the three bands are taken out of it. Each band is
    # measured by its ink: the logo by the marks inside its box, the tagline
    # by the height of a capital rather than by the font size.
    logo_scale = 700 / logo_w
    logo_x = (WIDTH - 700) / 2

    logo_ink_top = LOGO_INK_TOP * logo_scale
    logo_ink_h = (LOGO_INK_BOTTOM - LOGO_INK_TOP) * logo_scale

    g_w = grid_width()
    g_h = len(ROWS) * CELL + (len(ROWS) - 1) * ROW_GAP
    g_x = (WIDTH - g_w) / 2

    cap_h = TAGLINE_SIZE * CAP_RATIO
    text_h = (len(TAGLINE) - 1) * TAGLINE_LEAD + cap_h

    gap = (HEIGHT - logo_ink_h - g_h - text_h) / 4

    # Each band is placed by where its ink has to land, then walked back to
    # the coordinate the thing is actually drawn at
    logo_y = gap - logo_ink_top
    g_y = gap + logo_ink_h + gap

    # The text is drawn from the middle of its line, so the first line's
    # centre is half a capital below where the block starts
    text_y = g_y + g_h + gap + cap_h / 2

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}">',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{BACKGROUND}"/>',
    ]

    out += defs_markup()

    out += [
        f'<g transform="translate({logo_x} {logo_y}) scale({logo_scale})">',
        logo,
        '</g>',
    ]

    for row_idx, (color, steps) in enumerate(ROWS):
        y = g_y + row_idx * (CELL + ROW_GAP)

        # The dark cells first and the lit ones after, so that a bloom spills
        # over its neighbours rather than being painted on by the next cell.
        for on in (False, True):
            for step_idx, step in enumerate(steps):
                if (step == 'x') != on:
                    continue

                x = g_x + cell_x(step_idx)
                fill = color if on else BACKGROUND
                stroke = color if on else CELL_OFF_BORDER
                glow = f' filter="url(#bloom{row_idx})"' if on else ''

                out.append(
                    f'<rect x="{x:.1f}" y="{y:.1f}" '
                    f'width="{CELL}" height="{CELL}" '
                    f'fill="{fill}" stroke="{stroke}" stroke-width="2"{glow}/>'
                )

    for line_idx, line in enumerate(TAGLINE):
        y = text_y + line_idx * TAGLINE_LEAD

        out.append(
            f'<text x="{WIDTH / 2}" y="{y:.1f}" text-anchor="middle" '
            f'dominant-baseline="middle" fill="#ffffff" '
            f'font-family="{TAGLINE_FONT}" font-size="{TAGLINE_SIZE}" '
            f'font-weight="700" letter-spacing="1.5" '
            f'filter="url(#textBloom)">{line}</text>'
        )

    # The tube, over the lot. Order matters: the glow lifts the whole picture,
    # then the lines cut into what the glow lifted, then the corners go dark.
    out += [
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="url(#tubeGlow)" '
        f'style="mix-blend-mode:screen"/>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="url(#scanlines)"/>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="url(#vignette)"/>',
    ]

    out.append('</svg>')

    return '\n'.join(out)


# Where Chrome is, in the order worth looking. A different browser won't do:
# this relies on --screenshot, which Firefox and Safari have no equivalent of.
CHROMES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome',
    'chromium',
]


def find_chrome():
    for chrome in CHROMES:
        if Path(chrome).exists() or shutil.which(chrome):
            return chrome

    sys.exit('error: could not find Chrome, which is what draws the picture.\n'
             '       Install it, or add its path to CHROMES in this script.')


def screenshot(chrome, page, out):
    """Draw the page and save it, in whatever format `out` is named for.

    Chrome picks the format off the extension and compresses a JPEG at a
    quality of its own choosing, which lands around where an encoder set to
    85 would. There is no flag to move it, and no reason to want one here:
    the artefacts are only findable by zooming in on the edge of a lit cell,
    and the card is looked at at half this picture's width or less.
    """
    subprocess.run(
        [chrome, '--headless', '--disable-gpu', '--hide-scrollbars',
         f'--window-size={WIDTH},{HEIGHT}',
         f'--screenshot={out}', f'--virtual-time-budget=2000',
         page.as_uri()],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if not out.exists():
        sys.exit(f'error: Chrome did not produce {out.name}')

    print(f'wrote {out.name}, {WIDTH}x{HEIGHT}, '
          f'{out.stat().st_size / 1024:.0f} KB')


def main():
    chrome = find_chrome()

    work = REPO / '.og_image_tmp'
    work.mkdir(exist_ok=True)

    try:
        # The drawing goes in a page rather than being screenshotted directly,
        # so that the window is the size of the picture with no margin of the
        # browser's own around it
        page = work / 'og_image.html'
        page.write_text(
            '<!DOCTYPE html><html><head><meta charset="utf-8">'
            '<style>html,body{margin:0;padding:0;'
            f'background:{BACKGROUND};overflow:hidden}}</style></head>'
            f'<body>{build_svg()}</body></html>')

        # Twice over the same page, once per format. Chrome writes one
        # screenshot per run, and drawing it again costs a second.
        screenshot(chrome, page, OUT_JPG)
        screenshot(chrome, page, OUT_PNG)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
