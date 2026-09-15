import React from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';
import {useLocalSearchParams} from 'expo-router';
import {Theme} from '@amply/sample-shared';

/**
 * Where a campaign deeplink lands.
 *
 * expo-router matches `amplyexpo://promo/<id>` to this file by path, so the route has to exist
 * for the link to be anything other than a not-found screen — that is the whole reason it is
 * here. It shows what arrived and nothing else: the sample's own account of the delivery (the
 * URL, the campaign, the triggering event) is on the Campaigns tab, from the SDK's
 * `addDeepLinkListener`, and a second rendering of it here would be a second thing to keep true.
 */
export default function PromoScreen(): React.JSX.Element {
  const params = useLocalSearchParams();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Campaign deeplink</Text>
      <Text testID="expo.promo.params" style={styles.params}>
        {JSON.stringify(params, null, 2)}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.page,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  title: {
    color: Theme.label,
    fontSize: 20,
    fontWeight: '700',
  },
  params: {
    color: Theme.secondaryLabel,
    fontFamily: 'Courier',
    fontSize: 13,
  },
});
