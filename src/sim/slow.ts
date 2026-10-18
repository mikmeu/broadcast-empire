// The time limit of a long test. GitHub's machines, where the full suite runs for every branch
// (CI is set there), are a few times slower than a desktop, so a limit that fits on a Mac is
// stretched there. Only the tests use this.

/** Three times `ms` on GitHub, `ms` elsewhere. */
export const slow = (ms: number): number => (process.env.CI ? ms * 3 : ms);
