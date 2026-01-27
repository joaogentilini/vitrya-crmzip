import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      "coverage/**",
      "_backup_routes/**",
      "supabase/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "prefer-const": "off",
      "no-case-declarations": "off",
      "no-unsafe-finally": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
];
