#!/usr/bin/env sh
# Generate a self-signed TLS cert for the nginx container (testing / no domain).
# Usage: ./scripts/gen-self-signed-cert.sh <server-ip-or-hostname>
# Output: docker/certs/selfsigned.{crt,key} (gitignored, host-persisted).
#
# For a real domain, use Let's Encrypt instead (see docker/nginx-ssl.conf).
set -e

HOST="${1:-localhost}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/docker/certs"
mkdir -p "$DIR"

# Add an IP SAN when the arg looks like an IPv4 address, else a DNS SAN.
case "$HOST" in
  *[!0-9.]*) SAN="DNS:$HOST" ;;
  *)         SAN="IP:$HOST" ;;
esac

openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "$DIR/selfsigned.key" \
  -out    "$DIR/selfsigned.crt" \
  -subj   "/CN=$HOST" \
  -addext "subjectAltName=$SAN"

echo "Wrote $DIR/selfsigned.{crt,key} for $HOST ($SAN)"
