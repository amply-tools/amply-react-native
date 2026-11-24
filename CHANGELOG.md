# Changelog

## 0.22.0

- iOS: booleans from the SDK now reach JavaScript as `true`/`false` (custom properties, dataset snapshots, recent and system events such as `ConfigFetchFinished.success`, deeplink info, gate params). Before they arrived as `1`/`0`, unlike Android. If your iOS code compared such a value with `1`, compare with `true`.
- iOS: a property call made before `initialize` that fails no longer stops the calls queued after it, and no longer makes `initialize` reject.
- A gate presenter that throws no longer prints the error's text in `console.warn` (it could carry personal data); only the error's class is logged.
- Requires native Amply SDK 0.21.0: refused uploads stop after 3 attempts instead of retrying forever, typed trigger-param comparison, gate results saved before `trackGated` resolves.

## Unreleased

- String sets: custom properties can hold a `string[]` (a set of strings), read back as `string[]`, with `addToCustomPropertySet` and `removeFromCustomPropertySet`. Calls apply in the order made.
- Amplitude plugin: `$set` arrays and list mutations (`$append`, `$prepend`, `$preInsert`, `$postInsert`, `$remove`) are now forwarded as string sets.
  Behaviour change on update: a host with a broad `userProperties` selection starts writing sets and applying `$append` / `$remove` to Amply custom properties. A `userProperties` function now receives arrays for `$set` and the operand for list operations.
- Amplitude plugin: new `forwardArraysAsSets` option (default off) sends event-property arrays as string sets instead of one `"a,b,c"` string.
- Requires native Amply SDK 0.18.0.
