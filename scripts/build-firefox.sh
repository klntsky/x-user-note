#!/bin/bash
set -e

# Configuration variables
EXTENSION_NAME="x-user-note"
XPI_FILE="${EXTENSION_NAME}-firefox.xpi"

# List of files to include in the build, relative to project root
FILES_TO_INCLUDE=(
  "settings.html"
  "dist/content.js"
  "dist/options.js"
  "dist/background.js"
  "img/128.png"
)

npm run build
rm -f "./$XPI_FILE"

cp manifest.firefox.json manifest.json

zip_command="zip -r ./$XPI_FILE manifest.json"

for file in "${FILES_TO_INCLUDE[@]}"; do
  zip_command="$zip_command $file"
done

eval "$zip_command"

rm -f ./manifest.json

echo "Build successful! Created $XPI_FILE"