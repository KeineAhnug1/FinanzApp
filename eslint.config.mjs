import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["frontend/**/*.js"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: { ...globals.browser },
      sourceType: "module"
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["backend/**/*.{js,mjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module"
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
]);
