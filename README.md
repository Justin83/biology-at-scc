# Biology at SCC

**Biology at SCC** is the public-facing home for undergraduate research and
scholarly work across Somerset Community College (SCC)'s departments.

The site is published with [GitHub Pages](https://pages.github.com/) and is
built to grow over time — it is not tied to a single course, semester,
department, or research project.

## Structure

The site is organized along two axes:

- **Departments** — where the work happens (e.g. Math & Natural Sciences,
  Nursing), with more departments to be added over time
- **Categories** — recurring, cross-department showcases:
  - **Honors Symposium** — student Honors Symposium projects
  - **Profiles** — student research profiles
  - **Posters & Presentations** — student posters and conference presentations
  - **Archive** — a growing archive of past student work

## Site structure

```
.
├── index.html                          # Homepage
├── assets/                             # Shared styles
├── departments/
│   ├── index.html                      # Departments hub
│   ├── math-natural-sciences/          # Includes Biology
│   └── nursing/
├── honors-symposium/                   # Honors Symposium projects
├── profiles/                           # Student research profiles
├── posters-presentations/              # Posters & presentations
├── archive/                            # Archive of past work
├── labs/                               # Live classroom data-collection tools (BIO 151 spectrophotometry)
└── docs/                               # Project documentation (docs/bio151-live-lab/)
├── labs/                               # Live classroom data-collection tools (e.g. BIO 151 spectrophotometry)
└── docs/                               # Project documentation (docs/bio151-live-lab/)
```

Each top-level folder is its own page (or will grow into a small section of
pages) and is meant to be extended independently as new departments, students,
and faculty work come in — no folder is scoped to a particular semester or
course. Department-specific content and structure are still being scoped;
the current department pages are placeholders.

## Live labs

 is a phone data-entry form plus a classroom dashboard
for live spectrophotometry labs. It is static like the rest of the site but
stores readings in a Supabase database through PIN-checked RPC functions.
See  for architecture, URLs and operations.

## Live labs

`labs/bio151-spectro/` is a phone data-entry form plus a classroom dashboard
for live spectrophotometry labs. It is static like the rest of the site but
stores readings in a Supabase database through PIN-checked RPC functions.
See `docs/bio151-live-lab/README.md` for architecture, URLs and operations.

## Publishing

The site deploys automatically to GitHub Pages via GitHub Actions
(`.github/workflows/pages.yml`) on every push to `main`. There is no build
step — the repository is plain static HTML/CSS.

## License

Unless noted otherwise, content in this repository is licensed under the
[Creative Commons Attribution 4.0 International License](LICENSE) (CC BY
4.0).
