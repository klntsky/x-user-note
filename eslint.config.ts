import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'dist/**/*',
      'eslint.config.ts',
      'prettier.config.js'
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // Use type-checked recommended rules
  ...tseslint.configs.strictTypeChecked, // Use type-checked strict rules
  ...tseslint.configs.stylisticTypeChecked, // Optional: Use type-checked stylistic rules
  {
    languageOptions: {
      parserOptions: {
        project: true, // Should find tsconfig.json in the root directory
      },
    },
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-deprecated': 'off'
    }
  },
  eslintConfigPrettier
);
