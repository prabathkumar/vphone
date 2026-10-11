import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {useAuth} from '../store/authStore';
import {API_URL} from '../config';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

interface Instance {
  id: string;
  status: 'booting' | 'running' | 'stopping' | 'error';
  region: string;
  plan: string;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  running: '#22C55E',
  booting: '#F59E0B',
  stopping: '#F59E0B',
  error: '#EF4444',
};

export function HomeScreen({navigation}: Props) {
  const {logout, getToken} = useAuth();
  const isDark = useColorScheme() === 'dark';
  const s = isDark ? dark : light;

  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInstances = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/instances`, {
        headers: {Authorization: `Bearer ${token}`},
      });
      if (res.ok) {
        const data = await res.json();
        setInstances(data.instances ?? []);
      }
    } catch (e) {
      // silently fail on pull-to-refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  // Refresh on every screen focus
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchInstances();
    }, [fetchInstances]),
  );

  const handleDelete = (id: string) => {
    Alert.alert('Delete phone?', 'This will permanently destroy the virtual phone.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const token = getToken();
          await fetch(`${API_URL}/instances/${id}`, {
            method: 'DELETE',
            headers: {Authorization: `Bearer ${token ?? ''}`},
          });
          fetchInstances();
        },
      },
    ]);
  };

  const renderItem = ({item}: {item: Instance}) => (
    <TouchableOpacity
      style={[styles.card, s.card]}
      activeOpacity={0.85}
      onPress={() =>
        item.status === 'running'
          ? navigation.navigate('Stream', {instanceId: item.id})
          : null
      }
      onLongPress={() => handleDelete(item.id)}>
      <View style={styles.cardTop}>
        <Text style={styles.phoneEmoji}>📱</Text>
        <View
          style={[
            styles.statusDot,
            {backgroundColor: STATUS_COLOR[item.status] ?? '#9CA3AF'},
          ]}
        />
      </View>
      <Text style={[styles.cardTitle, s.text]}>India Phone</Text>
      <Text style={[styles.cardSub, s.muted]}>{item.region ?? 'Mumbai'}</Text>
      <View style={[styles.statusBadge, {borderColor: STATUS_COLOR[item.status] ?? '#9CA3AF'}]}>
        <Text style={[styles.statusText, {color: STATUS_COLOR[item.status] ?? '#9CA3AF'}]}>
          {item.status === 'running' ? 'Running' : item.status}
        </Text>
      </View>
      {item.status === 'running' && (
        <View style={styles.openButton}>
          <Text style={styles.openButtonText}>Open →</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.flex, s.bg]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, s.text]}>VPhone</Text>
        <TouchableOpacity onPress={() => logout()} hitSlop={12}>
          <Text style={s.muted}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1A73E8" />
        </View>
      ) : instances.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>📱</Text>
          <Text style={[styles.emptyTitle, s.text]}>No virtual phones yet</Text>
          <Text style={[styles.emptySub, s.muted]}>
            Launch a cloud Android in India and use UPI, IRCTC, banking & more from anywhere.
          </Text>
          <TouchableOpacity
            style={styles.launchButton}
            onPress={() => navigation.navigate('Launch')}
            activeOpacity={0.85}>
            <Text style={styles.launchButtonText}>+ Launch Phone</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={instances}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchInstances();
              }}
              tintColor="#1A73E8"
            />
          }
        />
      )}

      {/* FAB */}
      {instances.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('Launch')}
          activeOpacity={0.85}>
          <Text style={styles.fabLabel}>+ New Phone</Text>
        </TouchableOpacity>
      )}
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
  headerTitle: {fontSize: 24, fontWeight: '800', letterSpacing: -0.5},
  grid: {padding: 12, paddingBottom: 100},
  row: {gap: 12},
  card: {
    flex: 1,
    margin: 0,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    minHeight: 160,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  phoneEmoji: {fontSize: 32},
  statusDot: {width: 10, height: 10, borderRadius: 5, marginTop: 4},
  cardTitle: {fontSize: 15, fontWeight: '700'},
  cardSub: {fontSize: 13, marginTop: 2},
  statusBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 8,
  },
  statusText: {fontSize: 12, fontWeight: '600'},
  openButton: {
    marginTop: 10,
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: 'center',
  },
  openButtonText: {color: '#fff', fontWeight: '700', fontSize: 13},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32},
  emptyEmoji: {fontSize: 64},
  emptyTitle: {fontSize: 20, fontWeight: '700', marginTop: 16, textAlign: 'center'},
  emptySub: {fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22},
  launchButton: {
    marginTop: 28,
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  launchButtonText: {color: '#fff', fontWeight: '700', fontSize: 16},
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    backgroundColor: '#1A73E8',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: '#1A73E8',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  fabLabel: {color: '#fff', fontWeight: '700', fontSize: 15},
});

const light = StyleSheet.create({
  bg: {backgroundColor: '#F9FAFB'},
  card: {backgroundColor: '#FFFFFF'},
  text: {color: '#111827'},
  muted: {color: '#6B7280'},
});

const dark = StyleSheet.create({
  bg: {backgroundColor: '#0F0F0F'},
  card: {backgroundColor: '#1C1C1E'},
  text: {color: '#F9FAFB'},
  muted: {color: '#9CA3AF'},
});
