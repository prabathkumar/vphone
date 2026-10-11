import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../store/authStore';

const VALUE_PROPS = [
  {icon: '🏦', label: 'Indian banking & UPI from anywhere'},
  {icon: '🚂', label: 'Book IRCTC tickets and Tatkal'},
  {icon: '🔥', label: 'Gas agency refills & LPG booking'},
  {icon: '🪪', label: 'Complete eKYC without visiting India'},
  {icon: '📱', label: 'Any app that needs an Indian SIM'},
];

export function AuthScreen() {
  const [userId, setUserId] = useState('');
  const {login, error, status} = useAuth();
  const isDark = useColorScheme() === 'dark';
  const loading = status === 'loading';

  const s = isDark ? dark : light;

  const handleLogin = async () => {
    if (!userId.trim()) {
      Alert.alert('Enter your user ID or phone number');
      return;
    }
    await login(userId.trim());
  };

  return (
    <SafeAreaView style={[styles.flex, s.bg]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoEmoji}>📱</Text>
          <Text style={[styles.appName, s.primary]}>VPhone</Text>
          <Text style={[styles.tagline, s.muted]}>Your India, anywhere.</Text>
        </View>

        {/* Value props */}
        <View style={styles.propsContainer}>
          {VALUE_PROPS.map(p => (
            <View key={p.label} style={[styles.propRow, s.card]}>
              <Text style={styles.propIcon}>{p.icon}</Text>
              <Text style={[styles.propLabel, s.text]}>{p.label}</Text>
            </View>
          ))}
        </View>

        {/* Login */}
        <Text style={[styles.sectionTitle, s.text]}>Get Started</Text>
        <Text style={[styles.sectionSub, s.muted]}>
          Enter your user ID to continue — OTP login coming soon
        </Text>

        <TextInput
          style={[styles.input, s.input, s.text]}
          placeholder="User ID / phone number"
          placeholderTextColor={isDark ? '#555' : '#9CA3AF'}
          value={userId}
          onChangeText={setUserId}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleLogin}
        />

        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>Continue →</Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.legal, s.muted]}>
          By continuing, you agree to VPhone's Terms of Service.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {flex: 1},
  scroll: {padding: 24, paddingBottom: 48},
  header: {alignItems: 'center', marginBottom: 32, marginTop: 16},
  logoEmoji: {fontSize: 56},
  appName: {fontSize: 36, fontWeight: '800', marginTop: 8, letterSpacing: -0.5},
  tagline: {fontSize: 16, marginTop: 4},
  propsContainer: {marginBottom: 32, gap: 10},
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    gap: 14,
  },
  propIcon: {fontSize: 24},
  propLabel: {fontSize: 15, fontWeight: '500', flex: 1},
  sectionTitle: {fontSize: 20, fontWeight: '700', marginBottom: 4},
  sectionSub: {fontSize: 14, marginBottom: 16},
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  error: {color: '#EF4444', fontSize: 14, marginBottom: 12},
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {opacity: 0.6},
  buttonLabel: {color: '#fff', fontSize: 16, fontWeight: '700'},
  legal: {fontSize: 12, textAlign: 'center'},
});

const light = StyleSheet.create({
  bg: {backgroundColor: '#FFFFFF'},
  card: {backgroundColor: '#F3F4F6'},
  text: {color: '#111827'},
  muted: {color: '#6B7280'},
  primary: {color: '#1A73E8'},
  input: {borderColor: '#D1D5DB', backgroundColor: '#F9FAFB', color: '#111827'},
});

const dark = StyleSheet.create({
  bg: {backgroundColor: '#0F0F0F'},
  card: {backgroundColor: '#1C1C1E'},
  text: {color: '#F9FAFB'},
  muted: {color: '#9CA3AF'},
  primary: {color: '#4D9EFF'},
  input: {borderColor: '#374151', backgroundColor: '#1C1C1E', color: '#F9FAFB'},
});
