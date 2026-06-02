// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["apps/web/src/**/*.js"],
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
    files: ["backend/**/*.{js,mjs}", "database/**/*.{js,mjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module"
    },
    rules: {
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^(http|Pool)$"
      }]
    }
  },
  {
    files: ["shared/**/*.ts", "backend/**/*.ts", "database/**/*.ts"],
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    languageOptions: {
      parser: tsParser,
      globals: { ...globals.node },
      sourceType: "module"
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
]);
