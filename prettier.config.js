// prettier.config.js (originally .ts)

// No longer importing 'Config' type from 'prettier'
// import { type Config } from \'prettier\';

const config = {
  // No longer ': Config'
  // Use 2 spaces for indentation
  tabWidth: 2,
  // Use semicolons at the end of statements
  semi: true,
  // Use single quotes for strings
  singleQuote: true,
  // Add trailing commas where valid in ES5 (objects, arrays, etc.)
  trailingComma: 'es5',
  // Put > of HTML tags on the same line
  bracketSameLine: false,
  // Print spaces between brackets in object literals
  bracketSpacing: true,
  // Put the `>` of a multi-line JSX element at the end of the last line
  // (This is now covered by bracketSameLine, but kept for clarity if you see older configs)
  // jsxBracketSameLine: false, // Deprecated, use bracketSameLine
  // Include parentheses around a sole arrow function parameter
  arrowParens: 'always',
  // Format embedded code if Prettier can automatically identify it
  embeddedLanguageFormatting: 'auto',
  // Keep end of line characters as they are in the original file
  endOfLine: 'lf', // Or "auto" to keep existing line endings
  // Wrap prose if it exceeds print width
  proseWrap: 'preserve', // "always" or "never" are other options
  // Specify the line length that the printer will wrap on.
  printWidth: 80,
};

export default config;
