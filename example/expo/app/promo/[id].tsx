import { useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

export default function PromoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Extract promo ID from the parameter (could be an encoded URL)
  const promoId = id || 'default';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.heading}>🎉 Campaign Promo</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Promo Details</Text>
          <Text style={styles.label}>Promo ID:</Text>
          <Text style={styles.value}>{promoId}</Text>

          <Text style={styles.label}>Deep Link Parameter:</Text>
          <Text style={[styles.value, styles.mono]}>{decodeURIComponent(promoId)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>About This Screen</Text>
          <Text style={styles.description}>
            This screen is opened automatically when a campaign deep link is triggered
            from the Amply SDK. The deep link parameter is passed through expo-router's
            dynamic routing and displayed here for demonstration purposes.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Next Steps</Text>
          <Text style={styles.description}>
            In your app, you would use the promo ID to:
            {'\n\n'}
            • Load campaign-specific content
            {'\n\n'}
            • Display promotional offers
            {'\n\n'}
            • Track user engagement
            {'\n\n'}
            • Fulfill the campaign objective
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    color: '#6b7280',
    padding: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 12,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#2c6bed',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
