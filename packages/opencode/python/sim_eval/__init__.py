"""sim_eval: thin evaluation CLI around the vendored ASPIRE cap_harness genesis stack.

Runs one robot program on one genesis task/seed through the real
``cap_harness.run.run_program`` machinery and reports a machine-readable
result line::

    python -m sim_eval --task pick_cube --seed 1 --band dev --program path/to/program.py

The heavy simulation imports are deferred to after the interpreter check, so
this package stays importable under any interpreter.
"""

__all__: list[str] = []
