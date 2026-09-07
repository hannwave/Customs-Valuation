# Audit

SRS sections: 22.

Append-only audit capture and query access, actor, before/after values and decision justification.

Status: planned, except standalone calculation primitives where present. Follow `HsCodes` for the first complete query slice. Add contracts under `Contract/Command`, `Contract/Query`, `Contract/Repository`, and handlers under `Handler/Command` or `Handler/Query`. Keep EF and HTTP code outside Core. See `docs/IMPLEMENTATION_PLAN.md` for delivery gates.
