#!/bin/bash
set -e

# Configuration variables
EXTENSION_NAME="x-user-note"
XPI_FILE="${EXTENSION_NAME}.xpi"

# List of files to include in the build, relative to project root
FILES_TO_INCLUDE=(
  "settings.html"
  "manifest.json"
  "dist/content.js"
  "dist/options.js"
  "img/128.png"
)

# First build the TypeScript files
npm run build

# Remove any existing XPI file
echo "Removing existing $XPI_FILE if present..."
rm -f "./$XPI_FILE"

# Create the XPI file (which is a zip file)
echo "Creating $XPI_FILE with the following files:"
zip_command="zip -r ./$XPI_FILE"

for file in "${FILES_TO_INCLUDE[@]}"; do
  echo "Including $file"
  zip_command="$zip_command $file"
done

# Execute the zip command
echo "Executing: $zip_command"
eval "$zip_command"

echo "Build successful! Created $XPI_FILE" 