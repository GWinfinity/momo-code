# v1.0.0 Release Checklist

Pre-tag:
- [ ] `npm run build` succeeds locally (Mac arm64 + Linux x64)
- [ ] `bash install --no-modify-path` succeeds on a clean VM
- [ ] `momo --version` prints 1.0.0
- [ ] `momo /evolve --demo` prints `Tactics: 2` (or more)
- [ ] `momo /fine-tune` prints health report without errors
- [ ] `momo /fine-tune run --auto` produces `~/.momo/finetune/runs/run_*/run.json` with `ratchetPassed: true`
- [ ] All links in README.md actually resolve
- [ ] `curl -sI https://momozi.cc/install` returns 200

Tag + Release:
- [ ] git tag v1.0.0 && git push --tags
- [ ] Build prebuilt binaries (optional for v1) and upload to release assets
- [ ] Update website's hero install command (if changed)
