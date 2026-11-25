// Used by scripts/mutation-report.sh, which passes the files to mutate in
// STRYKER_FILES (space-separated, relative to this directory).
const files = (process.env.STRYKER_FILES ?? '').split(' ').filter(Boolean);
const includes = files.map((file) => `--include ${file}`).join(' ');

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // The Vitest runner bypasses the Angular builder (no TestBed setup, no
  // template compilation), so each mutant runs `ng test` on the matching specs.
  testRunner: 'command',
  commandRunner: {
    command: `npx ng test --no-watch --ts-config tsconfig.stryker.json ${includes}`,
  },
  mutate: files,
  coverageAnalysis: 'off',
  concurrency: 4,
  // Parallel `ng test` builds run well past the default limit (1.5x the
  // unmutated run + 5s), which reports nearly every mutant as a timeout.
  timeoutMS: 60000,
  reporters: ['json', 'clear-text'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
};
