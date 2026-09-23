# Security Policy

## Supported versions

TruthDiff is currently an alpha project. Security fixes are applied to the
latest `0.1.x` release line.

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue.

Use GitHub's **Report a vulnerability** option on the repository's Security
tab. Include reproduction steps, affected versions, impact, and any suggested
mitigation. The maintainers will acknowledge a complete report as promptly as
practical and coordinate disclosure after a fix is available.

TruthDiff analyzes local repositories and documentation. The standalone MVP
can also create a temporary checkout of an exact public `github.com` repository
URL. It does not support private credentials or arbitrary Git hosts, and the
preview server is intended to remain bound to the loopback interface.

Reports involving path traversal, symbolic-link escapes, DNS rebinding,
unintended network access, inherited Git configuration, command execution,
temporary-checkout cleanup, denial of service, or exposure of repository
content are especially important.
