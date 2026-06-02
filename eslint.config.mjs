import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Server-side date discipline: API routes run in UTC on the NAS, so date-fns
  // (runtime-tz format(), server-tz startOf*/endOf* boundaries) silently produces
  // wrong day boundaries for the family's local timezone. Route all date logic
  // through the tz-aware helpers in src/lib/timezone.ts and src/lib/finance-fy.ts.
  // This is the mechanical enforcement of the "never date-fns in server files" rule.
  {
    files: ["src/app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["date-fns", "date-fns/*", "date-fns-tz", "date-fns-tz/*"],
          message:
            "Do not use date-fns/date-fns-tz in API routes — the server runs in UTC. Use the timezone-aware helpers in src/lib/timezone.ts and src/lib/finance-fy.ts.",
        }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
