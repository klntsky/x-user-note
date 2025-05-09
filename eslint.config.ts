import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["dist/**/*"], // Adjusted path for dist
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // Use type-checked recommended rules
  ...tseslint.configs.strictTypeChecked, // Use type-checked strict rules
  ...tseslint.configs.stylisticTypeChecked, // Optional: Use type-checked stylistic rules
  {
    languageOptions: {
      parserOptions: {
        project: true, // Should find tsconfig.json in the root directory
        tsconfigRootDir: import.meta.dirname, // Will be / when this file is in /
      },
    },
  },
  eslintConfigPrettier
);
