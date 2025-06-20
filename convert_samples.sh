#!/bin/bash

# Directory to process
directory="./samples"

# Check if directory is provided
if [ -z "$directory" ]; then
    echo "Usage: $0 <directory>"
    exit 1
fi

# Check if directory exists
if [ ! -d "$directory" ]; then
    echo "Error: Directory '$directory' does not exist."
    exit 1
fi

# Check if ffmpeg and ffprobe are installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg is not installed. Please install it first."
    exit 1
fi
if ! command -v ffprobe &> /dev/null; then
    echo "Error: ffprobe is not installed. Please install it first."
    exit 1
fi

# Check for non-WAV files in the directory
find "$directory" -maxdepth 1 -type f ! -iname "*.wav" | while read -r file; do
    filename=$(basename "$file")
    if [ "$filename" = ".DS_Store" ]; then
        continue
    fi
    echo "Error: '$filename' is not a WAV file."
done

# Find all WAV files and process them
find "$directory" -maxdepth 1 -type f -iname "*.wav" | while read -r file; do
    filename=$(basename "$file")
    echo "Checking $filename..."

    # Get file properties using ffprobe
    channels=$(ffprobe -v error -show_entries stream=channels -of default=noprint_wrappers=1:nokey=1 "$file" 2>/dev/null)
    sample_rate=$(ffprobe -v error -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "$file" 2>/dev/null)
    sample_fmt=$(ffprobe -v error -show_entries stream=sample_fmt -of default=noprint_wrappers=1:nokey=1 "$file" 2>/dev/null)

    # Check if ffprobe failed to get properties (e.g., corrupted file)
    if [ -z "$channels" ] || [ -z "$sample_rate" ] || [ -z "$sample_fmt" ]; then
        echo "Error: Failed to read properties for '$filename'. It may be corrupted."
        continue
    fi

    # Check if file already matches desired format (mono, 44.1 kHz, 16-bit PCM)
    if [ "$channels" = "1" ] && [ "$sample_rate" = "44100" ] && [ "$sample_fmt" = "s16" ]; then
        #echo "$filename is already mono, 44.1 kHz, 16-bit PCM. Skipping."
        continue
    fi

    # Debug output to show detected properties
    echo "  Detected: Channels=$channels, SampleRate=$sample_rate Hz, SampleFormat=$sample_fmt"
    echo "Converting $filename to mono, 44.1 kHz, 16-bit PCM..."

    # Convert to temporary file first
    temp_file="${file%.wav}_temp.wav"
    ffmpeg -i "$file" -ac 1 -ar 44100 -sample_fmt s16 -y "$temp_file" 2>/dev/null

    if [ $? -eq 0 ]; then
        # Overwrite original file with converted file
        mv "$temp_file" "$file"
        echo "Successfully converted and overwritten: $filename"
    else
        echo "Error converting $filename"
        rm -f "$temp_file"  # Clean up temp file on failure
    fi
done

echo "Conversion process completed."