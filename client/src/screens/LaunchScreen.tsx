import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useAuth} from '../store/authStore';
import {API_URL} from '../config';
import type {RootStackParamList} from '../App';
type Props = NativeStackScreenProps<RootStackParamList, 'Launch'>;

// ---------------------------------------------------------------------------
// Config data
// ---------------------------------------------------------------------------

const REGIONS = [
  {id: 'india-mumbai', name: 'Mumbai', flag: '🇮🇳', sub: 'Best for UPI, banking, gas agencies', available: true},
  {id: 'india-hyderabad', name: 'Hyderabad', flag: '🇮🇳', sub: 'Low latency for South India', available: false},
  {id: 'sg', name: 'Singapore', flag: '🇸🇬', sub: 'Coming soon', available: false},
];

const PLANS = [
  {id: 'basic', name: 'Basic', price: 'Free', specs: '1 vCPU · 2 GB · 2 hr/day'},
  {id: 'standard', name: 'Standard', price: '₹299/mo', specs: '2 vCPU · 4 GB · Unlimited'},
  {id: 'pro', name: 'Pro', price: '₹799/mo', specs: '4 vCPU · 8 GB · Unlimited + priority'},
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function LaunchScreen({navigation}: Props) {
  const {getToken} = useAuth();
  const isDark = useColorScheme() === 'dark';
  const s = isDark ? dark : light;

  const [step, setStep] = useState(0);
  const [region, setRegion] = useState('india-mumbai');
  const [plan, setPlan] = useState('basic');
  const [launching, setLaunching] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const launch = async () => {
    setLaunching(true);
    setStatusMsg('Requesting virtual phone…');

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/instances`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({region, plan}),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const instanceId: string = data.id;

      setStatusMsg('Booting Android… ~30 seconds');

      pollRef.current = setInterval(async () => {
        const poll = await fetch(`${API_URL}/instances/${instanceId}`, {
          headers: {Authorization: `Bearer ${token}`},
        });
        if (!poll.ok) return;
        const inst = await poll.json();
        if (inst.status === 'running') {
          clearInterval(pollRef.current!);
          navigation.replace('Stream', {instanceId});
        } else if (inst.status === 'error') {
          clearInterval(pollRef.current!);
          setLaunching(false);
          setStatusMsg('Boot failed. Please try again.');
        } else {
          setStatusMsg(`Starting Android (${inst.status})…`);
        }
      }, 3000);
    } catch (e: any) {
      setLaunching(false);
      setStatusMsg(`Error: ${e.message}`);
    }
  };

  if (launching) {
    return (
      <SafeAreaView style={[styles.flex, s.bg]}>
        <View style={styles.launchingCenter}>
          <ActivityIndicator size="large" color="#1A73E8" />
          <Text style={[styles.launchTitle, s.text]}>Launching your virtual phone</Text>
          <Text style={[styles.launchSub, s.muted]}>{statusMsg}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, s.bg]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.backArrow, s.primary]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, s.text]}>New Phone</Text>
        <View style={{width: 56}} />
      </View>

      {/* Step pills */}
      <View style={styles.stepRow}>
        {['Region', 'Plan'].map((label, i) => (
          <View key={label} style={[styles.stepPill, i <= step && styles.stepActive]}>
            <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {step === 0 ? (
          <>
            <Text style={[styles.sectionTitle, s.text]}>Choose a region</Text>
            <Text style={[styles.sectionSub, s.muted]}>Your virtual phone boots here</Text>
            <View style={styles.optionList}>
              {REGIONS.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.optionCard,
                    s.card,
                    region === r.id && styles.optionSelected,
                    !r.available && styles.optionDisabled,
                  ]}
                  onPress={() => r.available && setRegion(r.id)}
                  activeOpacity={r.available ? 0.8 : 1}>
                  <Text style={styles.optionFlag}>{r.flag}</Text>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionName, s.text]}>{r.name}</Text>
                    <Text style={[styles.optionSub, s.muted]}>{r.sub}</Text>
                  </View>
                  {!r.available && (
                    <View style={styles.soonBadge}>
                      <Text style={styles.soonText}>Soon</Text>
                    </View>
                  )}
                  {r.available && region === r.id && (
                    <Text style={styles.check}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sectionTitle, s.text]}>Choose a plan</Text>
            <Text style={[styles.sectionSub, s.muted]}>Upgrade or downgrade anytime</Text>
            <View style={styles.optionList}>
              {PLANS.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.optionCard,
                    s.card,
                    plan === p.id && styles.optionSelected,
                  ]}
                  onPress={() => setPlan(p.id)}
                  activeOpacity={0.8}>
                  <View style={styles.optionText}>
                    <View style={styles.planRow}>
                      <Text style={[styles.optionName, s.text]}>{p.name}</Text>
                      <Text style={styles.planPrice}>{p.price}</Text>
                    </View>
                    <Text style={[styles.optionSub, s.muted]}>{p.specs}</Text>
                  </View>
                  {plan === p.id && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom buttons */}
      <View style={[styles.footer, s.border]}>
        {step > 0 && (
          <TouchableOpacity
            style={[styles.backButton, s.card]}
            onPress={() => setStep(s => s - 1)}
            activeOpacity={0.8}>
            <Text style={[styles.backButtonText, s.text]}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextButton, step === 0 ? {flex: 1} : {flex: 2}]}
          onPress={step < 1 ? () => setStep(s => s + 1) : launch}
          activeOpacity={0.85}>
          <Text style={styles.nextButtonText}>
            {step < 1 ? 'Next →' : '🚀 Launch'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {fontSize: 18, fontWeight: '700'},
  backArrow: {fontSize: 17, fontWeight: '600'},
  stepRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8},
  stepPill: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  stepActive: {backgroundColor: '#1A73E8'},
  stepLabel: {display: 'none'},
  stepLabelActive: {display: 'none'},
  scroll: {padding: 20, paddingBottom: 20},
  sectionTitle: {fontSize: 22, fontWeight: '800', marginBottom: 4, letterSpacing: -0.3},
  sectionSub: {fontSize: 14, marginBottom: 20},
  optionList: {gap: 12},
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {borderColor: '#1A73E8'},
  optionDisabled: {opacity: 0.45},
  optionFlag: {fontSize: 30},
  optionText: {flex: 1},
  optionName: {fontSize: 16, fontWeight: '700'},
  optionSub: {fontSize: 13, marginTop: 2},
  planRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  planPrice: {fontSize: 16, fontWeight: '800', color: '#1A73E8'},
  check: {fontSize: 20, color: '#1A73E8', fontWeight: '700'},
  soonBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  soonText: {fontSize: 12, color: '#6B7280', fontWeight: '600'},
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {fontWeight: '600', fontSize: 16},
  nextButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  launchingCenter: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32},
  launchTitle: {fontSize: 22, fontWeight: '700', marginTop: 28, textAlign: 'center'},
  launchSub: {fontSize: 15, marginTop: 10, textAlign: 'center'},
});

const light = StyleSheet.create({
  bg: {backgroundColor: '#F9FAFB'},
  card: {backgroundColor: '#FFFFFF'},
  text: {color: '#111827'},
  muted: {color: '#6B7280'},
  primary: {color: '#1A73E8'},
  border: {borderTopColor: '#E5E7EB'},
});

const dark = StyleSheet.create({
  bg: {backgroundColor: '#0F0F0F'},
  card: {backgroundColor: '#1C1C1E'},
  text: {color: '#F9FAFB'},
  muted: {color: '#9CA3AF'},
  primary: {color: '#4D9EFF'},
  border: {borderTopColor: '#2C2C2E'},
});
