/**
 * VPhone — environment config
 *
 * For local dev, set __DEV__ = true (React Native does this automatically
 * in debug builds).  Simulator talks to Mac's host machine at 10.0.2.2
 * on Android or localhost on iOS simulator — but Metro bridges localhost,
 * so we use localhost for both in dev.
 *
 * Production values are read from the build-time env or fall back to the
 * hosted API domain.
 */

// iOS simulator can reach the Mac host directly at localhost
// Android emulator must use 10.0.2.2 — handled at runtime if needed.
const DEV_HOST = 'localhost:3000';
const PROD_HOST = 'api.vphone.app';

const host = __DEV__ ? DEV_HOST : PROD_HOST;
const wsScheme = __DEV__ ? 'ws' : 'wss';
const httpScheme = __DEV__ ? 'http' : 'https';

export const API_URL = `${httpScheme}://${host}`;
export const WS_URL  = `${wsScheme}://${host}`;

/** WebSocket path for the signalling server */
export const WS_PATH = '/ws';
