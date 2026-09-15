import React from 'react';
import {StyleSheet, View} from 'react-native';

/**
 * The §7.4 readiness marker, as a dedicated node rather than an attribute on the screen's root.
 *
 * The spec puts `amply.snapshot.ready` on the root view, which is what the native samples do —
 * on UIKit and Compose every view is in the tree, so an identifier on the root is visible to a
 * harness. React Native is different: a `testID` becomes `accessibilityIdentifier` on the UIView,
 * but a plain container is **pruned from the accessibility tree**, so a marker on the root would
 * never be found by anything polling it. Measured with `idb ui describe-all` against this app:
 * every button and field appeared with its manifest id, and every container `<View testID=…>` did
 * not.
 *
 * Marking the ROOT `accessible` is not the fix — that collapses the whole screen into one
 * element and hides every control the same harness needs. So the marker is its own 1×1
 * accessible node, out of the way of layout and of touches, carrying the id and the same string
 * as its label.
 */
export function SnapshotReadyMarker({visible}: {visible: boolean}): React.JSX.Element | null {
  if (!visible) {
    return null;
  }
  return (
    <View
      testID="amply.snapshot.ready"
      accessible
      accessibilityLabel="amply.snapshot.ready"
      pointerEvents="none"
      style={styles.marker}
    />
  );
}

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
  },
});
