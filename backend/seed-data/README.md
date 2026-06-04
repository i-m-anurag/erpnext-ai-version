# seed-data

File-based base data, loaded by the seed runner (`npm run seed`). Editing data
means editing JSON here — no code changes. All loaders are idempotent.

```
seed-data/
├── base/                      shipped product defaults (scope = base)
│   ├── permissions/<module>.json   { module, permissions: [{ action, description }] }
│   ├── roles/<code>.json           { code, name, isSystem, permissions: "all" | ["module:action", "*:*.read", "*:view"] }
│   ├── masters/<slug>.json         { slug, name, managedBy: seeded|ui, editable, formSlug?, data?: [...] }
│   ├── forms/<slug>.json           a full form definition (validated against the form schema)
│   └── email-templates/<slug>.json { slug, subject, html, variables: [...] }   (Batch 2)
└── clients/<clientSlug>/      this deployment's client overrides (scope = custom)
    ├── forms/<slug>.json           partial override — merges field-by-field onto the base form
    ├── email-templates/<slug>.json
    └── masters/<slug>.json
```

- The active client is set by `clientSlug` in `config/config.<env>.json`. When set,
  files under `clients/<clientSlug>/` are seeded as overrides on top of `base/` and
  merge through the config-resolution pipeline.
- Re-running the seeder after a product upgrade re-applies `base/` without disturbing
  client overrides — base versions only bump when their content actually changed.
- Role `permissions` accepts `"all"`, exact `"module:action"` keys, or glob patterns
  (`*` matches any segment), e.g. `"*:*.read"` (all read actions), `"*:view"` (all screen access).
