import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  useColorScheme,
  ActivityIndicator,
  PanResponder,
  Dimensions,
} from 'react-native';
import {RTCView, type MediaStream} from 'react-native-webrtc';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {WebRTCService, type ConnectionStatus} from '../services/webrtcService';
import {useAuth} from '../store/authStore';
import type {RootStackParamList} from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Stream'>;

// Android keycodes
const KEY = {BACK: 4, HOME: 3, RECENTS: 187} as const;

export function StreamScreen({route, navigation}: Props) {
  const {instanceId} = route.params;
  const {getToken} = useAuth();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  const svcRef = useRef<WebRTCService | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide controls after 3 s of no interaction
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  // Start WebRTC
  useEffect(() => {
    StatusBar.setHidden(true);

    const svc = new WebRTCService(instanceId, {
      onStatusChange: setStatus,
      onStream: s => setStream(s),
      onError: msg => setError(msg),
    });
    svcRef.current = svc;

    const token = getToken();
    if (token) svc.connect(token);

    showControls();

    return () => {
      StatusBar.setHidden(false);
      svc.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [instanceId, getToken, showControls]);

  // Pan responder — relay touch to Android
  const {width, height} = Dimensions.get('window');

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        const {locationX, locationY} = evt.nativeEvent;
        svcRef.current?.sendTouch('down', locationX / width, locationY / height);
        showControls();
      },
      onPanResponderMove: evt => {
        const {locationX, locationY} = evt.nativeEvent;
        svcRef.current?.sendTouch('move', locationX / width, locationY / height);
      },
      onPanResponderRelease: evt => {
        const {locationX, locationY} = evt.nativeEvent;
        svcRef.current?.sendTouch('up', locationX / width, locationY / height);
      },
    }),
  ).current;

  const sendKey = (keyCode: number) => {
    svcRef.current?.sendKey(keyCode);
    showControls();
  };

  const retry = () => {
    setError(null);
    const token = getToken();
    if (token) svcRef.current?.connect(token);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <View style={styles.root}>
      {/* Video layer */}
      {stream ? (
        <RTCView
          style={StyleSheet.absoluteFill}
          streamURL={stream.toURL()}
          objectFit="contain"
          mirror={false}
          {...panResponder.panHandlers}
        />
      ) : (
        <View style={styles.statusLayer}>
          {status === 'error' ? (
            <>
              <Text style={styles.statusIcon}>⚠️</Text>
              <Text style={styles.statusText}>{error ?? 'Connection failed'}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={retry}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator color="#1A73E8" size="large" />
              <Text style={styles.statusText}>
                {status === 'connecting'
                  ? 'Connecting to your virtual phone…'
                  : 'Starting stream…'}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Top bar */}
      {controlsVisible && (
        <View style={[styles.topBar, {paddingTop: insets.top + 4}]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.topBtn}
            hitSlop={10}>
            <Text style={styles.topBtnText}>‹ Exit</Text>
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <View style={[
              styles.statusDot,
              {backgroundColor: status === 'connected' ? '#22C55E' : '#F59E0B'},
            ]} />
            <Text style={styles.topTitle}>India Phone</Text>
          </View>
          <View style={{width: 60}} />
        </View>
      )}

      {/* Android nav bar */}
      {stream && controlsVisible && (
        <View style={[styles.navBar, {paddingBottom: insets.bottom + 4}]}>
          <TouchableOpacity style={styles.navBtn} onPress={() => sendKey(KEY.BACK)} hitSlop={10}>
            <Text style={styles.navIcon}>◁</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => sendKey(KEY.HOME)} hitSlop={10}>
            <Text style={styles.navIcon}>⬤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => sendKey(KEY.RECENTS)} hitSlop={10}>
            <Text style={styles.navIcon}>▣</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},

  statusLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
  },
  statusIcon: {fontSize: 48},
  statusText: {color: '#9CA3AF', fontSize: 16, textAlign: 'center'},
  retryButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryText: {color: '#fff', fontWeight: '700', fontSize: 15},

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topBtn: {paddingHorizontal: 8, paddingVertical: 6},
  topBtnText: {color: '#fff', fontSize: 17, fontWeight: '600'},
  topCenter: {flexDirection: 'row', alignItems: 'center', gap: 6},
  statusDot: {width: 8, height: 8, borderRadius: 4},
  topTitle: {color: '#fff', fontWeight: '600', fontSize: 15},

  navBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  navBtn: {padding: 12},
  navIcon: {color: '#fff', fontSize: 22},
});
