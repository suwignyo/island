# One image for three uses: the dev container, the agent worker, and CI.
# The Playwright image brings Node and a pinned Chromium, so screenshot tests
# render the same pixels everywhere. Keep this tag equal to @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ARG CLAUDE_CODE_VERSION=latest

RUN apt-get update && apt-get install -y --no-install-recommends \
      git gh jq less sudo iptables ipset iproute2 dnsutils aggregate ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# The firewall script is the only command the user may run as root.
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod 755 /usr/local/bin/init-firewall.sh \
    && echo "pwuser ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/firewall \
    && chmod 0440 /etc/sudoers.d/firewall \
    && mkdir -p /home/pwuser/.claude && chown -R pwuser:pwuser /home/pwuser/.claude

USER pwuser
ENV DEVCONTAINER=true
# the editor sets the working folder (Codespaces: /workspaces/island)
