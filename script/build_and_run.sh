#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

show_usage() {
  cat <<'USAGE'
usage: ./script/build_and_run.sh [mode]

Modes:
  start, run        Start Expo Go over the local network
  --phone, phone    Clear Metro cache and start for a physical phone
  --tunnel, tunnel  Start through an Expo tunnel
  --android         Open an Android emulator
  --web             Open the web app
  --doctor          Run Expo diagnostics
  --help            Show this help
USAGE
}

EXPO_CMD=(npx.cmd expo)
if [[ "${OS:-}" != "Windows_NT" ]]; then EXPO_CMD=(npx expo); fi

case "$MODE" in
  start|run) exec "${EXPO_CMD[@]}" start --lan ;;
  --phone|phone) exec "${EXPO_CMD[@]}" start --lan --clear ;;
  --tunnel|tunnel) exec "${EXPO_CMD[@]}" start --tunnel --clear ;;
  --android|android) exec "${EXPO_CMD[@]}" start --android ;;
  --web|web) exec "${EXPO_CMD[@]}" start --web ;;
  --doctor|doctor) exec npx.cmd expo-doctor ;;
  --help|help) show_usage ;;
  *) show_usage >&2; exit 2 ;;
esac
