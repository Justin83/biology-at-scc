# biologyatscc.com

The site is served by GitHub Pages from this repository at `https://biologyatscc.com`.
DNS for `biologyatscc.com` is on Cloudflare (nameservers `brad` and `jule.ns.cloudflare.com`).

| Address | What it does |
|---|---|
| `https://biologyatscc.com/` | The site (GitHub Pages) |
| `https://www.biologyatscc.com/` | GitHub redirects it to `biologyatscc.com` |
| `https://club.biologyatscc.com/` | Cloudflare redirects it to `https://biologyatscc.com/math-science-club/` (paths carry over: `/signup/` goes to `/math-science-club/signup/`) |
| `https://justin83.github.io/biology-at-scc/…` | GitHub redirects old links and printed QR codes to the same page on `biologyatscc.com` |

A GitHub Pages site can have only one custom domain, so the club subdomain is a redirect
rather than a second site.

## Cloudflare DNS (zone `biologyatscc.com`)

| Type | Name | Content | Proxy status |
|---|---|---|---|
| A | `@` | `185.199.108.153` | DNS only |
| A | `@` | `185.199.109.153` | DNS only |
| A | `@` | `185.199.110.153` | DNS only |
| A | `@` | `185.199.111.153` | DNS only |
| AAAA | `@` | `2606:50c0:8000::153` | DNS only |
| AAAA | `@` | `2606:50c0:8001::153` | DNS only |
| AAAA | `@` | `2606:50c0:8002::153` | DNS only |
| AAAA | `@` | `2606:50c0:8003::153` | DNS only |
| CNAME | `www` | `justin83.github.io` | DNS only |
| A | `club` | `192.0.2.1` | Proxied |
| TXT | `_github-pages-challenge-Justin83` | the value GitHub shows | DNS only |

- The GitHub records are **DNS only** (grey cloud). GitHub issues the HTTPS certificate
  itself and can't while Cloudflare proxies the traffic.
- The `club` record is **Proxied** (orange cloud) and points at `192.0.2.1`, an address
  reserved for documentation that is never contacted. Cloudflare answers the request and
  redirects before anything reaches an origin.
- The TXT record verifies the domain to the GitHub account, so no one else can attach it
  to their own Pages site.

## Cloudflare redirect rule

Rules → Redirect Rules → Create rule:

- Rule name: `club subdomain`
- When incoming requests match: custom filter expression, **Hostname** equals
  `club.biologyatscc.com`
- Then: URL redirect, **Dynamic**, expression
  `concat("https://biologyatscc.com/math-science-club", http.request.uri.path)`,
  status code **301**, **Preserve query string** on

## GitHub

- Repository Settings → Pages → Custom domain: `biologyatscc.com`, then **Enforce
  HTTPS** once GitHub has issued the certificate.
- Pages deploys with GitHub Actions (`.github/workflows/pages.yml`), so there is no
  `CNAME` file: the custom domain lives in the Pages settings.
- Profile Settings → Pages → Add a domain: `biologyatscc.com` gives the TXT record above.

## Addresses written into the site

- `math-science-club/assets/club.js` `homeUrl` (`https://club.biologyatscc.com/`): the
  club QR code (`tools/math-science-club/make-qr.mjs`).
- `research/freshwater/assets/fieldobs.js` `submitUrl`: the observation-form QR code
  (`tools/freshwater-portal/make-qr.mjs`) and the class QR codes on the review page.
- `labs/bio151-spectro/config.js` `STUDENT_FORM_URL`: the BIO 151 live-lab form address.

## Checks

```
curl -sI https://biologyatscc.com/ | head -1                      # 200
curl -sI https://www.biologyatscc.com/ | grep -i ^location        # https://biologyatscc.com/
curl -sI https://club.biologyatscc.com/signup/ | grep -i ^location # https://biologyatscc.com/math-science-club/signup/
curl -sI https://justin83.github.io/biology-at-scc/math-science-club/ | grep -i ^location
```
