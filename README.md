# Biology at SCC

**Biology at SCC** is the public-facing home for undergraduate biology
research and student scholarly work at Somerset Community College (SCC).

The site is published with [GitHub Pages](https://pages.github.com/) and is
built to grow over time — it is not tied to a single course, semester, or
research project.

## What's here (and growing)

- **CUREs** — Course-Based Undergraduate Research Experiences
- **Research** — ongoing and longitudinal student/faculty research projects
- **Honors Symposium** — student Honors Symposium projects
- **Profiles** — student research profiles
- **Posters & Presentations** — student posters and conference presentations
- **Archive** — a growing archive of past student work

## Site structure

```
.
├── index.html                  # Homepage
├── assets/                     # Shared styles
├── cures/                      # CUREs
├── research/                   # Ongoing / longitudinal research
├── honors-symposium/           # Honors Symposium projects
├── profiles/                   # Student research profiles
├── posters-presentations/      # Posters & presentations
└── archive/                    # Archive of past work
```

Each top-level folder is its own page (or will grow into a small section of
pages) and is meant to be extended independently as new student and faculty
work comes in — no folder is scoped to a particular semester or course.

## Publishing

The site deploys automatically to GitHub Pages via GitHub Actions
(`.github/workflows/pages.yml`) on every push to `main`. There is no build
step — the repository is plain static HTML/CSS.

## License

Unless noted otherwise, content in this repository is licensed under the
[Creative Commons Attribution 4.0 International License](LICENSE) (CC BY
4.0).
