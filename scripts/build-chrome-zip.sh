#!/bin/bash
set -e

# Configuration variables
EXTENSION_NAME="x-user-note"
BUILD_DIR="${EXTENSION_NAME}-dist"
ZIP_FILE="${EXTENSION_NAME}-chrome.zip"

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

# Copy the manifest file first to ensure it's at the root
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

# Create the zip file
echo "Creating zip file..."
cd "$BUILD_DIR"
zip -r "../$ZIP_FILE" ./*
cd ..

echo "Build successful! Created $ZIP_FILE"

# Clean up
echo "Cleaning up build directory..."
rm -rf "$BUILD_DIR"

echo "ZIP file ready for Chrome Web Store submission" 