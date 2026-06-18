# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| 0.x     | No (EOL)  |

## Reporting a Vulnerability

If you discover a security vulnerability in momo Code, please report it responsibly:

1. **Email**: security@momocode.ai
2. **Subject**: [SECURITY] Brief description
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Fix & Release**: Within 30 days (critical), 90 days (standard)
- **Disclosure**: Coordinated disclosure after fix is available

## Scope

The following are in scope for security reports:
- momo Code CLI and core packages
- The `/fine-tune` self-evolution system
- Model provider integrations
- Session data handling

The following are NOT in scope:
- Third-party AI model behavior
- Issues in upstream dependencies (report to respective projects)
- Social engineering attacks against users

## Security Features

- **Secret Scrubbing**: Automatic removal of API keys and credentials from training data
- **Permission System**: Configurable allow/deny/ask for file edits and shell commands
- **Telemetry Control**: All telemetry is opt-in; training data stays local by default
- **Self-Evolution Safeguards**: Ratchet gate prevents regression; human approval required for promotion

## Hall of Fame

We thank the following security researchers who have responsibly disclosed vulnerabilities:

*None yet -- be the first!*
