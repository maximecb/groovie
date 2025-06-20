#!/usr/bin/env python3

import os

sample_paths = []

for root, dirs, files in os.walk('samples'):

    files = sorted(files)

    for file in files:
        if not file.endswith('.wav'):
            continue

        file_path = os.path.join(root, file)
        sample_paths.append(file_path)


sample_paths_str = ', '.join(map(lambda s: f"'{s}'", sample_paths))
print(sample_paths_str)

js_str = f"export const SAMPLE_PATHS = [{sample_paths_str}];\n"

with open("sample_list.js", "w") as f:
    f.write(js_str)
