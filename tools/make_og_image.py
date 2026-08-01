#!/usr/bin/env python3

"""Builds og_image.png, the picture that shows up when a link is shared.

Social media and chat apps read the picture named by the og:image tag in
index.html, and they don't run JavaScript or read SVG, so this is a flat PNG
committed to the repo rather than anything drawn at load time.

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
OUT = REPO / 'og_image.png'

# What every social network asks for. Anything near this ratio is shown
# uncropped by X, Facebook, Messenger and Signal alike.
WIDTH = 1200
HEIGHT = 630

# Colours the app draws with, from view.js and style.css. A row of the grid is
# drawn in the colour its pattern would be, so the picture and the app agree.
BACKGROUND = '#000000'
CELL_OFF_BORDER = '#666666'

# One row per colour, each with the part a kit piece would play. Read together
# they are an ordinary four-four beat, which is what makes the picture legible
# as a sequencer rather than as an abstract grid.
ROWS = [
    ('#fe2204', 'x...x...x...x...'),   # kick
    ('#fec802', '....x.......x...'),   # snare
    ('#00d0d0', 'x.x.x.x.x.x.x.x.'),   # closed hat
    ('#7433ff', '..x...x...x...x.'),   # a perc line off the beat
]

# Grid geometry. A beat is four steps, and the gap between beats is wider than
# the gap between steps, the way the editor spaces them.
CELL = 44
STEP_GAP = 8
BEAT_GAP = 16
ROW_GAP = 10
CORNER = 6


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


def build_svg():
    logo, logo_w, logo_h = logo_markup()

    # The logo sits across the top, the grid under it, both centred, with the
    # space left over split above and below so the pair reads as one block.
    #
    # The gap above the logo is smaller than the one below the grid, which
    # looks wrong written down and right on the picture. The logo's glow needs
    # room inside its own box, so it carries roughly twenty units of its own
    # padding above the letters: matching the two gaps by the numbers leaves
    # the drawing visibly top heavy. These are the figures that come out even.
    logo_scale = 700 / logo_w
    logo_x = (WIDTH - 700) / 2
    logo_y = 68

    g_w = grid_width()
    g_h = len(ROWS) * CELL + (len(ROWS) - 1) * ROW_GAP
    g_x = (WIDTH - g_w) / 2
    g_y = logo_y + logo_h * logo_scale + 74

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}">',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{BACKGROUND}"/>',
        f'<g transform="translate({logo_x} {logo_y}) scale({logo_scale})">',
        logo,
        '</g>',
    ]

    for row_idx, (color, steps) in enumerate(ROWS):
        y = g_y + row_idx * (CELL + ROW_GAP)

        for step_idx, step in enumerate(steps):
            x = g_x + cell_x(step_idx)
            on = step == 'x'
            fill = color if on else BACKGROUND
            stroke = color if on else CELL_OFF_BORDER

            out.append(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{CELL}" height="{CELL}" '
                f'rx="{CORNER}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
            )

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

        subprocess.run(
            [chrome, '--headless', '--disable-gpu', '--hide-scrollbars',
             f'--window-size={WIDTH},{HEIGHT}',
             f'--screenshot={OUT}', f'--virtual-time-budget=2000',
             page.as_uri()],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    if not OUT.exists():
        sys.exit('error: Chrome did not produce a screenshot')

    size_kb = OUT.stat().st_size / 1024
    print(f'wrote {OUT.name}, {WIDTH}x{HEIGHT}, {size_kb:.0f} KB')


if __name__ == '__main__':
    main()
