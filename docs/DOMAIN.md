# biologyatscc.com

The site is served by GitHub Pages from this repository at `https://biologyatscc.com`.
DNS for `biologyatscc.com` is on Cloudflare (nameservers `brad` and `jule.ns.cloudflare.com`).

| Address | What it is |
|---|---|
| `https://biologyatscc.com/` | The site (GitHub Pages) |
| `https://biologyatscc.com/msclub/` | Math & Science Club |
| `https://www.biologyatscc.com/` | GitHub redirects it to `biologyatscc.com` |
| `https://justin83.github.io/biology-at-scc/…` | GitHub redirects old links to the same page on `biologyatscc.com` |
| `…/math-science-club/…` | Small redirect pages to the same page under `msclub/` (query string kept), for old links and printed QR codes |

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

## Last step, after the domain has settled: QR codes

The QR codes and the addresses they encode still point at
`justin83.github.io/biology-at-scc/…`. Those keep working (GitHub and the redirect pages
forward them), so they change last, in one pass, once `biologyatscc.com` has been
working for a while:

- `msclub/assets/club.js` `homeUrl` → `https://biologyatscc.com/msclub/`, then
  `node tools/math-science-club/make-qr.mjs`; update the address printed beside the QR
  code in `msclub/index.html` (big-screen view) and `msclub/qr/index.html` (poster).
- `research/freshwater/assets/fieldobs.js` `submitUrl` →
  `https://biologyatscc.com/research/freshwater/observations/submit/`, then
  `node tools/freshwater-portal/make-qr.mjs`. The review page builds class QR codes from
  the same setting.
- `labs/bio151-spectro/config.js` `STUDENT_FORM_URL`, `labs/bio151-spectro/qr-student-form.svg`
  and `docs/bio151-live-lab/qr-latex-snippet.tex`.
- Printed flyers.

## Checks

```
curl -sI https://biologyatscc.com/ | head -1                       # 200
curl -sI https://biologyatscc.com/msclub/ | head -1                # 200
curl -sI https://www.biologyatscc.com/ | grep -i ^location         # https://biologyatscc.com/
curl -sI https://justin83.github.io/biology-at-scc/msclub/ | grep -i ^location
```
