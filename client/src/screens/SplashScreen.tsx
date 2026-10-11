import React from 'react';
import {View, Text, ActivityIndicator, StyleSheet, useColorScheme} from 'react-native';

export function SplashScreen() {
  const isDark = useColorScheme() === 'dark';

  return (
    <View style={[styles.root, isDark ? styles.darkBg : styles.lightBg]}>
      <Text style={styles.logo}>📱</Text>
      <Text style={[styles.title, isDark && styles.textDark]}>VPhone</Text>
      <Text style={styles.tagline}>Your India, anywhere.</Text>
      <ActivityIndicator
        style={styles.spinner}
        color="#1A73E8"
        size="large"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  lightBg: {backgroundColor: '#FFFFFF'},
  darkBg: {backgroundColor: '#0F0F0F'},
  logo: {fontSize: 64},
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1A73E8',
    marginTop: 12,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 6,
  },
  textDark: {color: '#4D9EFF'},
  spinner: {marginTop: 48},
});
