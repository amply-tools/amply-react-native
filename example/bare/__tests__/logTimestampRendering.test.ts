import {LogValue, type LogParam} from '@amply/sample-shared';

/**
 * Pins the one rendering rule that has already broken once, in the one place a grep cannot see it.
 *
 * SAMPLE_APP_SPEC.md §5.2 requires this string character for character on every platform —
 * `stamped 4.2s earlier` — and the rule it replaces ("within 50 ms") failed because it sat on
 * Android's dispatch latency and rendered differently run to run. A wording that three samples must
 * agree on, guarding a boundary that jitter crosses, is exactly the thing to hold with a test
 * rather than with care. iOS holds the same four cases in `LogTimestampRenderingTests.swift`.
 */
function params(stampedSecondsEarlier: number): LogParam[] {
  const row = Date.now();
  return LogValue.paramsFrom({timestamp: row - stampedSecondsEarlier * 1000}, row);
}

describe('the restated timestamp', () => {
  // Dispatch latency is not news, at any of the values it actually takes — including the 126 ms
  // that made the old 50 ms rule flip between runs on Android.
  test('dispatch latency renders nothing', () => {
    expect(params(0)).toHaveLength(0);
    expect(params(0.05)).toHaveLength(0);
    expect(params(0.126)).toHaveLength(0); // the gap that broke Android
    expect(params(0.999)).toHaveLength(0);
  });

  test('one second or more renders the delta, in the spec’s exact words', () => {
    const rendered = params(4.2);
    expect(rendered).toHaveLength(1);
    expect(rendered[0].key).toBe('stamped');
    expect(rendered[0].value).toBe('4.2s earlier');

    // One second is the floor, not the first value above it.
    expect(params(1).at(0)?.value).toBe('1.0s earlier');
  });

  // A rendered `:` would be a clock reading, which is the thing the row already carries.
  test('the absolute time is never restated', () => {
    for (const seconds of [0, 0.5, 1, 42, 90_000]) {
      for (const param of params(seconds)) {
        expect(LogValue.render(param.value)).not.toContain(':');
      }
    }
  });

  // A stamp from the future is clock skew, not a late event.
  test('a stamp after the row is dropped', () => {
    expect(params(-5)).toHaveLength(0);
  });

  test('every other param is untouched by the timestamp rule', () => {
    const row = Date.now();
    const rendered = LogValue.paramsFrom({key: 'plan', newValue: 'pro', timestamp: row}, row);
    expect(rendered.map((param: LogParam) => param.key)).toEqual(['key', 'newValue']);
  });
});

describe('a value renders by its type', () => {
  test('booleans never render as 1 or 0', () => {
    expect(LogValue.render(true)).toBe('true');
    expect(LogValue.render(false)).toBe('false');
  });

  test('an empty collection is dropped rather than counted', () => {
    expect(LogValue.isWorthShowing([])).toBe(false);
    expect(LogValue.isWorthShowing({})).toBe(false);
    expect(LogValue.isWorthShowing([1])).toBe(true);
  });

  test('a plausible epoch from another day keeps its date', () => {
    // 1 Oct 2026 02:00 local — time alone would read as this morning.
    const then = new Date(2026, 9, 1, 2, 0, 0).getTime();
    expect(LogValue.render(then)).toBe('1 Oct 2026 02:00');
  });

  test('a number below the epoch window stays a number', () => {
    expect(LogValue.render(7)).toBe('7');
  });

  // Both keys present is one overwrite; one key alone is a set or a removal, and keeps its name.
  test('oldValue and newValue collapse only when both are present', () => {
    expect(
      LogValue.collapseOldNew([
        {key: 'oldValue', value: 'pro'},
        {key: 'newValue', value: 'premium'},
      ]),
    ).toEqual([{key: 'value', value: 'pro → premium'}]);

    const setOnly = [{key: 'newValue', value: 'pro'}];
    expect(LogValue.collapseOldNew(setOnly)).toEqual(setOnly);
    const removalOnly = [{key: 'oldValue', value: 'pro'}];
    expect(LogValue.collapseOldNew(removalOnly)).toEqual(removalOnly);
  });
});
