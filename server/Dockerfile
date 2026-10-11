FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive
ARG SCRCPY_VERSION=2.4

# System deps: ADB, ffmpeg (H.264→I420 for bridge), netcat (ADB wait probe)
RUN apt-get update && apt-get install -y --no-install-recommends \
    android-tools-adb \
    ffmpeg \
    netcat-openbsd \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps (production only)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/
COPY scripts/ ./scripts/

# Download scrcpy-server.jar at build time
RUN mkdir -p assets && \
    curl -fL \
      "https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}" \
      -o assets/scrcpy-server.jar

EXPOSE 3000

CMD ["node", "src/index.js"]
