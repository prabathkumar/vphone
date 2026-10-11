# VPhone — Your India, anywhere.

A virtual Indian Android phone, accessible from anywhere in the world.  
Spin up a cloud Android in Mumbai → stream it to your phone via WebRTC → use UPI, IRCTC, banking, gas agency, and eKYC as if you're physically in India.

---

## Why

> "I've been living in Malaysia for 3 years. My gas agency won't refill without an app that needs an Indian SIM. My bank keeps flagging international logins. IRCTC Tatkal is impossible from a foreign IP."

The 32 million strong Indian diaspora faces this every day. VPhone fixes it.

---

## Architecture

```
Flutter App (iOS / Android)
        │  WebRTC video stream
        │  Touch events (WebSocket)
        ▼
VPhone Signalling Server (Node.js)
        │  ADB + scrcpy
        ▼
Android KVM Instance (QEMU, Mumbai DC)
        │
        ▼
Indian Apps — UPI, IRCTC, Banking, Gas, eKYC
```

---

## Project Structure

```
vphone/
├── infra/          # Terraform — Oracle Cloud / AWS
├── server/         # Node.js signalling + instance manager
│   ├── src/
│   │   ├── index.js           # Express + WebSocket
│   │   ├── instanceManager.js # QEMU lifecycle
│   │   └── auth.js            # JWT middleware
│   └── Dockerfile
└── client/         # Flutter app (iOS + Android)
    └── lib/
        ├── main.dart
        ├── screens/
        │   ├── auth_screen.dart
        │   ├── home_screen.dart
        │   ├── launch_screen.dart
        │   └── stream_screen.dart
        └── services/
            ├── auth_service.dart
            └── webrtc_service.dart
```

---

## Getting Started

### Server

```bash
cd server
cp .env.example .env   # set JWT_SECRET etc.
npm install
npm run dev
```

### Flutter Client

```bash
cd client
flutter pub get
flutter run
```

Set `API_URL` and `WS_URL` via `--dart-define`:

```bash
flutter run \
  --dart-define=API_URL=https://api.vphone.app \
  --dart-define=WS_URL=wss://api.vphone.app
```

---

## Roadmap

| Phase | Feature |
|-------|---------|
| 1 | Core stream (WebRTC + QEMU + scrcpy) ✅ |
| 2 | OTP phone auth (Firebase) |
| 2 | Virtual Indian SIM (Airtel / Jio API) |
| 3 | eKYC (Video KYC / PAN-based) |
| 3 | Multi-region (Hyderabad, Singapore) |
| 4 | iOS client |

---

## Regulatory Notes

- **Cloud infra**: No special licence required
- **Telecom / SIM**: Partner with a licensed telco (Airtel/Jio) — no DoT licence needed for the platform
- **eKYC**: Video KYC (V-CIP, RBI Para 19) and PAN-based KYC work for NRIs without Aadhaar
- **Banking apps**: Permitted — user is accessing their own accounts

---

Built with ❤️ for the Indian diaspora.
