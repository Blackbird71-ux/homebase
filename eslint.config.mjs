import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // App-wide date-DISPLAY discipline. A toLocale*/Intl.DateTimeFormat call with no
  // explicit `timeZone` renders in the JS runtime timezone — UTC on the NAS server,
  // the device tz in the browser — so it names the wrong day/time for the family's
  // local timezone (correct only by accident when the viewer's device == family tz).
  // Always pass an explicit timeZone, via formatInTz(date, timezone, options) from
  // src/lib/timezone.ts (client components get the tz from useFamilyTimezone()).
  // See DATE-DISPLAY-AUDIT.md. The :has(Property[key.name='timeZone']) check passes
  // any call that already supplies a timeZone (including the meal-plan { timeZone:'UTC' }
  // convention). Pure number formatting (foo.toLocaleString()) is exempt with an inline
  // `// eslint-disable-next-line no-restricted-syntax -- number, not a date`.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error",
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']:not(:has(Property[key.name='timeZone']))",
          message: "toLocaleDateString without an explicit timeZone renders in the runtime tz (UTC on the server). Use formatInTz(date, timezone, options) from src/lib/timezone.ts.",
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleTimeString']:not(:has(Property[key.name='timeZone']))",
          message: "toLocaleTimeString without an explicit timeZone renders in the runtime tz (UTC on the server). Use formatInTz(date, timezone, options) from src/lib/timezone.ts.",
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString']:not(:has(Property[key.name='timeZone']))",
          message: "toLocaleString on a Date without an explicit timeZone renders in the runtime tz. Use formatInTz(date, timezone, options). If this is number formatting, add `// eslint-disable-next-line no-restricted-syntax -- number, not a date`.",
        },
        {
          selector: "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']:not(:has(Property[key.name='timeZone']))",
          message: "new Intl.DateTimeFormat without an explicit timeZone formats in the runtime tz. Use formatInTz / the helpers in src/lib/timezone.ts.",
        },
      ],
      // date-fns format()/startOf*/endOf* run in the runtime tz too — the same bug by
      // another route. Banned outright in API routes (block below); a WARN everywhere
      // else until the broader date-fns → Luxon migration lands (DATE-DISPLAY-AUDIT.md
      // "Deferred — the larger issue"), then flip this to "error".
      "no-restricted-imports": ["warn", {
        patterns: [{
          group: ["date-fns", "date-fns/*", "date-fns-tz", "date-fns-tz/*"],
          message:
            "Avoid date-fns/date-fns-tz — it formats in the runtime tz. Use the tz-aware helpers in src/lib/timezone.ts. (Migration tracked in DATE-DISPLAY-AUDIT.md.)",
        }],
      }],
    },
  },
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
