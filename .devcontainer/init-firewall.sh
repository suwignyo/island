#!/usr/bin/env bash
# Outbound allowlist for the dev container, based on the reference container in anthropics/claude-code.
# Everything not listed here is blocked. Add a host only when a task needs it.
set -euo pipefail
IFS=$'\n\t'

# In Codespaces the editor connects through GitHub relays on the internet; this allowlist would cut it.
if [ "${CODESPACES:-}" = "true" ] || [ -n "${CODESPACE_NAME:-}" ] || [ -d /workspaces/.codespaces ]; then
  echo "Codespaces: firewall not used"; exit 0
fi

ALLOWED_DOMAINS=(
  api.anthropic.com claude.ai platform.claude.com statsig.anthropic.com sentry.io
  registry.npmjs.org
  github.com api.github.com codeload.github.com objects.githubusercontent.com raw.githubusercontent.com
)

# keep Docker's DNS rules, reset the rest
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)
iptables -F; iptables -X; iptables -t nat -F; iptables -t nat -X; iptables -t mangle -F; iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true
if [ -n "$DOCKER_DNS_RULES" ]; then
  iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
  iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
  echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
fi

# DNS, SSH and loopback before the default policy
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

ipset create allowed-domains hash:net

# GitHub publishes its address ranges
gh_ranges=$(curl -fsS https://api.github.com/meta)
echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | grep -v ':' | aggregate -q | while read -r cidr; do
  ipset add -exist allowed-domains "$cidr"
done

for domain in "${ALLOWED_DOMAINS[@]}"; do
  ips=$(dig +short A "$domain" | grep -E '^[0-9.]+$' || true)
  if [ -z "$ips" ]; then echo "warning: no address for $domain"; continue; fi
  while read -r ip; do ipset add -exist allowed-domains "$ip"; done <<< "$ips"
done

# the host network (for the editor and port forwarding)
HOST_IP=$(ip route | awk '/default/ {print $3; exit}')
HOST_NET=$(echo "$HOST_IP" | sed 's/\.[0-9]*$/.0\/24/')
iptables -A INPUT -s "$HOST_NET" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NET" -j ACCEPT

iptables -P INPUT DROP; iptables -P FORWARD DROP; iptables -P OUTPUT DROP
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

# check: a blocked host fails, an allowed host works
if curl --connect-timeout 5 -fsS https://example.com >/dev/null 2>&1; then echo "firewall check failed: example.com is reachable"; exit 1; fi
curl --connect-timeout 5 -fsS https://api.github.com/zen >/dev/null || { echo "firewall check failed: api.github.com is blocked"; exit 1; }
echo "firewall is on"
