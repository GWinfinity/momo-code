# Vendored provenance: NVlabs/ASPIRE `cap_harness`

## Source

- Upstream repository: https://github.com/NVlabs/ASPIRE
- Upstream commit: `fa00f0e` ("ASPIRE v1.0 release")
- Vendored from the uncommitted working tree at `D:/githbi/ASPIRE`, whose only
  delta vs `fa00f0e` in the vendored subset is the genesis adapter port
  (files marked with `# genesis port:` comments upstream, plus the new
  `cap_harness/genesis/` package).

## License

Apache-2.0 (upstream `LICENSE`). `NOTICE` is retained in this directory and
must be kept with any redistribution of this package.

Files that we modified or added carry the attribution line:

```
# Vendored from NVlabs/ASPIRE (Apache-2.0) and extended with the genesis adapter port.
```

Files copied verbatim keep their original headers. None of the vendored
upstream files carried a copyright header (SPDX headers exist only in the
excluded `yam_real/calibration/` tree upstream).

## Included

| File | Lines | Note |
| --- | --- | --- |
| `__init__.py` | 3 | verbatim |
| `errors.py` | 87 | verbatim |
| `contracts.py` | 1518 | genesis glue edit (`JOINT_DIMENSIONS["genesis"] = 7`) |
| `protocols.py` | 218 | verbatim |
| `geometry.py` | 430 | verbatim |
| `api.py` | 2086 | verbatim |
| `runtime.py` | 534 | verbatim |
| `registry.py` | 383 | genesis glue edit (`GENESIS_PUBLIC_TOOL_NAMES`, `genesis.` prefix) |
| `artifacts.py` | 841 | verbatim |
| `run.py` | 488 | genesis dispatch + lazy-import adaptation (see below) |
| `genesis/__init__.py` | 46 | new genesis adapter port |
| `genesis/adapter.py` | 1250 | new genesis adapter port |
| `genesis/providers.py` | 364 | new genesis adapter port |
| `genesis/registry.py` | 147 | new genesis adapter port |

## Excluded (and why)

- `libero/` — only used by `benchmark="libero-pro"`; its imports in `run.py`
  were moved into that branch.
- `robosuite/`, `behavior/`, `yam_real/` — only reached lazily from `run.py`
  branches for those benchmarks; not needed for genesis.
- `agent/` — MCP layer, not part of the run closure.
- `cli.py`, `batch.py`, `doctor.py`, `environments.py` — CLI/diagnostics only.
  `batch.py` has a pre-existing Unix-only `import resource`; only `cli.py`
  imports `batch.py`, and the `run.py` closure was verified not to touch it,
  so no Windows shim is required.
- `validation/` — only imported lazily for robosuite/behavior protocol
  evaluators; not needed for the genesis import closure.
- `providers/` (`sam3/`, `graspnet/`, `pyroki/`, `curobo/`, `http.py`,
  `wire.py`, `yam_kinematics.py`, `service_runtime.py`) — HTTP service
  provider clients; their imports in `run.py` were moved into the benchmark
  branches that use them.
- `configs/` — libero/yam_real station configuration, not needed for genesis.

## Vendored modifications vs the ASPIRE working tree

- `run.py`: the top-level imports of `libero/` and the four HTTP provider
  clients were moved into the benchmark branches that use them (the
  `contact_graspnet` provider is now created inside the behavior and
  robosuite/yam_real branches instead of unconditionally). The genesis path is
  unchanged. Running the excluded benchmarks with this vendored copy would
  require re-adding the excluded subpackages.
- `contracts.py`, `registry.py`: taken as-is from the ASPIRE working tree,
  including the genesis glue edits.
- `genesis/`: taken as-is from the ASPIRE working tree (new, uncommitted
  upstream).
