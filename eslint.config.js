import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // Use type-checked recommended rules
  ...tseslint.configs.strictTypeChecked,     // Use type-checked strict rules
  ...tseslint.configs.stylisticTypeChecked,  // Optional: Use type-checked stylistic rules
  {
    languageOptions: {
      parserOptions: {
        project: true, // Enable type-aware linting
        tsconfigRootDir: __dirname, // Or the appropriate root directory
      },
    },
  },
  eslintConfigPrettier,
);
