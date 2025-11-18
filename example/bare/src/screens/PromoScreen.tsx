import React from 'react';
import {SafeAreaView, StatusBar, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../types/navigation';

export type PromoScreenProps = NativeStackScreenProps<RootStackParamList, 'Promo'>;

export function PromoScreen({route}: PromoScreenProps): React.JSX.Element {
  const params = route.params ?? {};

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <Text style={styles.title}>Promo Screen</Text>
        <Text style={styles.subtitle}>Resolved from deep link</Text>
        <Text style={styles.heading}>Parameters</Text>
        <Text style={styles.mono}>{JSON.stringify(params ?? {}, null, 2)}</Text>
        <Text style={[styles.heading, {marginTop: 16}]}>Resolved URL</Text>
        <Text style={styles.mono}>{params?.url ?? '—'}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 12,
    color: '#444',
  },
  heading: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 12,
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: '#222',
  },
});
