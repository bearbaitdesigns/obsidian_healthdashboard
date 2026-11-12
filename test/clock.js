// Pins "now" so date-based fixtures don't go stale: node -r ./test/clock.js, or require it first. FAKE_NOW overrides.
const RealDate = Date;
const NOW = new RealDate(process.env.FAKE_NOW || '2026-11-09T15:00:00').getTime();
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}
global.Date = FakeDate;
