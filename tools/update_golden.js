#!/usr/bin/env node

// Appends what the corpus currently encodes to onto tests/golden_links.js.
//
// The pinned links are what says that a link shared today still opens as the
// song it was made from. So this script only ever adds: it reads the list,
// works out which of the corpus links aren't in it yet, and splices those in
// before the closing bracket. Everything already in the file, including links
// pasted in by hand and the comments around them, is left byte for byte as it
// was. There is no way to run this and come out with fewer links than you
// started with.
//
// That means a test failing is still not something this script fixes. A corpus
// song that no longer encodes to its pinned link means the encoder writes
// something new, and the old link is still out in the world being opened by
// somebody. What has to give is the change, or ENCODING_VERSION. Once the
// version has moved and the old links have a decoder that still reads them,
// running this adds the corpus again at the new version alongside the old.
//
// Run it with `node tools/update_golden.js` from anywhere in the repo, and
// check what it did with `git diff`: the only thing that should ever show up
// is added lines.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CORPUS, build_song } from "../tests/corpus.js";
import { GOLDEN_LINKS } from "../tests/golden_links.js";
import { project_to_hash } from "../model.js";

const OUT_PATH = fileURLToPath(new URL('../tests/golden_links.js', import.meta.url));

// The links already pinned, whichever song each of them came from. A corpus
// link that is already in the file under some other name, or with no name at
// all because somebody shared it before it was written down, is one this has
// nothing left to add for.
let pinned = new Set(GOLDEN_LINKS.map(entry => entry.link));

let added = CORPUS
    .map(song => ({ song: song.name, link: project_to_hash(build_song(song)) }))
    .filter(entry => !pinned.has(entry.link));

if (added.length == 0)
{
    console.log('every corpus link is already pinned, nothing to add');
    process.exit(0);
}

let text = readFileSync(OUT_PATH, 'utf8');

// Where the list ends, which is the one place in the file this writes to.
// Everything before it is left exactly as it was found.
let end = text.lastIndexOf('];');
if (end < 0)
    throw Error(`no end of list found in ${OUT_PATH}`);

let entries = added.map(entry =>
    `\n    { song: ${JSON.stringify(entry.song)}, link:\n` +
    `        ${JSON.stringify(entry.link)} },\n`
).join('');

writeFileSync(OUT_PATH, text.slice(0, end) + entries + text.slice(end));

for (let entry of added)
    console.log(`added ${JSON.stringify(entry.song)}`);

console.log(`\n${added.length} link(s) added, ${pinned.size} left untouched`);
