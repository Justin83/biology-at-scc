# biologyatscc.com

The site is served by GitHub Pages from this repository at `https://biologyatscc.com`.
DNS for `biologyatscc.com` is on Cloudflare (nameservers `brad` and `jule.ns.cloudflare.com`).

| Address | What it is |
|---|---|
| `https://biologyatscc.com/` | The site (GitHub Pages) |
| `https://biologyatscc.com/msclub/` | Math & Science Club |
| `https://www.biologyatscc.com/` | GitHub redirects it to `biologyatscc.com` |
| `https://justin83.github.io/biology-at-scc/…` | GitHub redirects old links to the same page on `biologyatscc.com` |

The club's old folder was removed in November 2026: links and QR codes for the old club
address (including flyers printed before then) no longer work.

## Cloudflare DNS (zone `biologyatscc.com`)

| Type | Name | Content | Proxy status |
|---|---|---|---|
| A | `@` | `185.199.108.153` | DNS only |
| A | `@` | `185.199.109.153` | DNS only |
| A | `@` | `185.199.110.153` | DNS only |
| A | `@` | `185.199.111.153` | DNS only |
| AAAA | `@` | `2606:50c0:8000::153` | DNS only (optional) |
| AAAA | `@` | `2606:50c0:8001::153` | DNS only (optional) |
| AAAA | `@` | `2606:50c0:8002::153` | DNS only (optional) |
| AAAA | `@` | `2606:50c0:8003::153` | DNS only (optional) |
| CNAME | `www` | `justin83.github.io` | DNS only |
| TXT | `_github-pages-challenge-Justin83` | the value GitHub shows | DNS only |

- All records are **DNS only** (grey cloud). GitHub issues the HTTPS certificate itself and
  can't while Cloudflare proxies the traffic.
- The TXT record verifies the domain to the GitHub account, so no one else can attach it
  to their own Pages site.

## GitHub

- Repository Settings → Pages → Custom domain: `biologyatscc.com`, then **Enforce
  HTTPS** once GitHub has issued the certificate.
- Pages deploys with GitHub Actions (`.github/workflows/pages.yml`), so there is no
  `CNAME` file: the custom domain lives in the Pages settings.
- Profile Settings → Pages → Add a domain: `biologyatscc.com` gives the TXT record above.

## QR codes

Every QR code on the site encodes a `biologyatscc.com` address. Each is generated from one
setting; change the setting, run the generator, and `--check` confirms they match.

| QR code | Opens | Setting | Generator |
|---|---|---|---|
| `msclub/assets/qr-club.svg` (club home, big-screen view, poster) | `https://biologyatscc.com/msclub/` | `homeUrl` in `msclub/assets/club.js` | `node tools/msclub/make-qr.mjs` |
| `research/freshwater/assets/qr-submit.svg` (and the class QR codes on the review page) | `https://biologyatscc.com/research/freshwater/observations/submit/` | `submitUrl` in `research/freshwater/assets/fieldobs.js` | `node tools/freshwater-portal/make-qr.mjs` |
| `labs/bio151-spectro/qr-student-form.svg`, `docs/bio151-live-lab/qr-student-form.png` | `https://biologyatscc.com/labs/bio151-spectro/` | `STUDENT_FORM_URL` in `labs/bio151-spectro/config.js` (and `\LabFormURL` in `docs/bio151-live-lab/qr-latex-snippet.tex`) | `node tools/bio151-live-lab/make-qr.mjs` |

QR codes printed before the move that encode `justin83.github.io/biology-at-scc/…` keep
working (GitHub forwards them), except codes for the old club address.

## Checks

```
curl -sI https://biologyatscc.com/ | head -1                       # 200
curl -sI https://biologyatscc.com/msclub/ | head -1                # 200
curl -sI https://www.biologyatscc.com/ | grep -i ^location         # https://biologyatscc.com/
curl -sI https://justin83.github.io/biology-at-scc/msclub/ | grep -i ^location
```
