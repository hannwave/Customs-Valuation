# HistoricalCustomsPrices

SRS sections: 26; overview open issue.

Authorized historical declarations in a separate table and API; confirm source contract and access restrictions.

Status: planned, except standalone calculation primitives where present. Follow `HsCodes` for the first complete query slice. Add contracts under `Contract/Command`, `Contract/Query`, `Contract/Repository`, and handlers under `Handler/Command` or `Handler/Query`. Keep EF and HTTP code outside Core. See `docs/IMPLEMENTATION_PLAN.md` for delivery gates.
