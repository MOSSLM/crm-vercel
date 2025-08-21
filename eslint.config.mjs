import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Ton bloc d’overrides moderne
  {
    rules: {
      // Trop verbeux pour l’instant : on relâche
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-function-type": "off",

      // Beaucoup de texte FR avec des apostrophes → on coupe cette règle
      "react/no-unescaped-entities": "off",

      // Conseils perf Next/Image → en "warn"
      "@next/next/no-img-element": "warn",

      // Moins bloquant sur les imports non utilisés
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }],

      // Bruit inutile
      "import/no-anonymous-default-export": "off"
    },
  },
];

export default eslintConfig;
