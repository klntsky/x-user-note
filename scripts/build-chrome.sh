#!/bin/bash
set -e

# Configuration variables
EXTENSION_NAME="x-user-note"
BUILD_DIR="${EXTENSION_NAME}-dist"
CRX_FILE="${EXTENSION_NAME}-chrome.crx"
TEMP_CRX_FILE="${EXTENSION_NAME}-dist.crx"
KEY_FILE="key.pem"

# List of files to include in the build, relative to project root
FILES_TO_INCLUDE=(
  "settings.html"
  "dist/content.js"
  "dist/options.js"
  "dist/background.js"
  "img/128.png"
)

# First build the TypeScript files
npm run build

# Create a clean build directory
echo "Creating clean build directory at $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cp manifest.chrome.json "$BUILD_DIR/manifest.json"

# Copy the necessary files, preserving directory structure
echo "Copying required files..."
for file in "${FILES_TO_INCLUDE[@]}"; do
  # Create directory structure if it doesn't exist
  dir=$(dirname "$BUILD_DIR/$file")
  mkdir -p "$dir"
  
  # Copy the file
  cp "$file" "$BUILD_DIR/$file"
  echo "Copied $file"
done

# Pack the extension using chrome or chromium
echo "Packing extension..."
if command -v chromium &> /dev/null; then
  BROWSER="chromium"
elif command -v google-chrome &> /dev/null; then
  BROWSER="google-chrome"
else
  echo "Error: Neither chromium nor google-chrome found"
  exit 1
fi

echo "Using browser: $BROWSER"

"$BROWSER" --pack-extension="$(pwd)/${EXTENSION_NAME}-dist" --pack-extension-key="$(pwd)/${KEY_FILE}"

# Move the CRX file to the project directory
if [ -f "./$TEMP_CRX_FILE" ]; then
  echo "Moving CRX file to project directory..."
  mv "./$TEMP_CRX_FILE" "./$CRX_FILE"
  echo "Build successful! Created $CRX_FILE"
else
  echo "Error: CRX file not created"
  exit 1
fi

rm -rf "$BUILD_DIR"