# Changelog

## Unreleased

- String sets: custom properties can hold a `string[]` (a set of strings), read back as `string[]`, with `addToCustomPropertySet` and `removeFromCustomPropertySet`. Calls apply in the order made.
- Amplitude plugin: `$set` arrays and list mutations (`$append`, `$prepend`, `$preInsert`, `$postInsert`, `$remove`) are now forwarded as string sets.
  Behaviour change on update: a host with a broad `userProperties` selection starts writing sets and applying `$append` / `$remove` to Amply custom properties. A `userProperties` function now receives arrays for `$set` and the operand for list operations.
- Amplitude plugin: new `forwardArraysAsSets` option (default off) sends event-property arrays as string sets instead of one `"a,b,c"` string.
- Requires native Amply SDK 0.18.0.
