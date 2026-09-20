/* FloodLens shared helpers — API clients, honest error states, zone rendering. */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const API = "https://mehyar.us/api";
export const LOOKUP_URL = `${API}/floodlens/lookup`;
export const SUBSCRIBE_URL = `${API}/floodlens/subscribe`;
export const CHECKOUT_URL = `${API}/pay/checkout`;
export const STATUS_URL = `${API}/pay/status`;
export const DOWNLOAD_URL = `${API}/floodlens/download`;
// Browser fetch always sends the browser's own User-Agent (mehyar.us's bot
// firewall 1010s non-browser clients); setting User-Agent manually is a
// forbidden header, so we rely on the real browser UA here.

export const EMAIL_KEY = "floodlens.email.v1";
export const LOOKUP_KEY = "floodlens.lookup.v1";

export function getEmail() { return localStorage.getItem(EMAIL_KEY) || ""; }
export function setEmail(e) { localStorage.setItem(EMAIL_KEY, e); }
export function getLookup() {
  try { return JSON.parse(localStorage.getItem(LOOKUP_KEY) || "null"); } catch { return null; }
}
export function setLookup(l) { localStorage.setItem(LOOKUP_KEY, JSON.stringify(l)); }

export function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || "").trim()); }

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export async function apiPost(url, body, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, ok: res.ok, data, text };
  } catch (e) {
    return { status: 0, ok: false, networkError: true, message: String((e && e.message) || e) };
  } finally { clearTimeout(t); }
}

export async function apiGet(url, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, ok: res.ok, data, text };
  } catch (e) {
    return { status: 0, ok: false, networkError: true, message: String((e && e.message) || e) };
  } finally { clearTimeout(t); }
}

/* Insurance estimate ranges (FEMA brief §3, verbatim copy). */
export const PREMIUM_RANGES = {
  X_MINIMAL: "$400–$900",
  X_MODERATE: "$500–$1,200",
  A_RIVERINE: "$800–$2,000",
  A_SHALLOW: "$700–$1,800",
  V_COASTAL: "$1,600–$7,000+",
  D: "$900–$2,000",
};

export const PREMIUM_FOOTNOTE =
  "Estimates based on published NFIP data (FEMA, 2025–2026) for a $250,000 " +
  "building-coverage policy. Your actual premium is set by your insurer under " +
  "FEMA's Risk Rating 2.0 and varies by property.";

export const DISCLAIMER =
  "Not an official flood determination. This lookup reads FEMA's National Flood " +
  "Hazard Layer for informational purposes only. It is not a certified flood zone " +
  "determination and does not replace the Standard Flood Hazard Determination Form " +
  "(SFHDF) your lender or insurer requires. Flood-zone boundaries are approximate, " +
  "maps are updated over time (see the map effective date shown), and recent Letters " +
  "of Map Change may not yet be reflected. For insurance, lending, or building " +
  "decisions, consult your local floodplain administrator, your insurance agent, or " +
  "a licensed flood-determination provider. Premium ranges shown are estimates, not " +
  "quotes — get a real quote at floodsmart.gov.";

/* Risk band → card colorway. Never invents: renders whatever the API returned. */
function bandOf(r) {
  const z = String(r.zone || "").toUpperCase();
  if (/^V/.test(z)) return "coastal";
  if (/^A/.test(z)) return "high";
  if (/SHADED|X500|\bB\b/.test(z + " " + (r.zone_subtype || ""))) return "moderate";
  if (z === "X" || z === "C") return "minimal";
  if (z === "D") return "undetermined";
  return "nodata";
}

const BAND_STYLE = {
  high:        { bar: "#B3402A", ink: "#B3402A", soft: "#FBEAE6" },
  coastal:     { bar: "#9A3412", ink: "#9A3412", soft: "#FDEEE2" },
  moderate:    { bar: "#B45309", ink: "#B45309", soft: "#FDF3E3" },
  minimal:     { bar: "#2F7D4F", ink: "#2F7D4F", soft: "#E6F3EB" },
  undetermined:{ bar: "#5C7285", ink: "#5C7285", soft: "#EEF3F6" },
  nodata:      { bar: "#5C7285", ink: "#5C7285", soft: "#EEF3F6" },
};

/* Screenshot-ready result card. Renders only fields the API supplied. */
export function resultCard(r) {
  const band = bandOf(r);
  const st = BAND_STYLE[band];
  const est = r.premium_range || r.estimate;
  const asOf = r.data_as_of || r.map_effective || r.queried_at || "";
  const degraded = r.degraded ? `<div class="state warn" style="margin:0 0 12px">FEMA is temporarily unreachable — showing last checked data from ${esc(r.cached_at || asOf || "an earlier check")}.</div>` : "";
  return `
  <div class="result-card" style="--rc-bar:${st.bar};--rc-ink:${st.ink};--rc-soft:${st.soft}">
    <span class="badge-unofficial">Not an official flood determination</span>
    <div class="rc-addr">${esc(r.address_normalized || r.address || "")}</div>
    ${degraded}
    <div class="rc-row">
      <div class="rc-zone">${esc(r.zone || "?")}</div>
      <div>
        <div class="rc-risk">${esc(r.risk_plain || "")}</div>
        <div class="rc-sub">${esc(r.zone_subtype || "")}${r.sfha ? " · <b>Special Flood Hazard Area</b>" : ""}</div>
      </div>
    </div>
    ${r.risk_summary ? `<p class="rc-sub" style="margin:0 0 4px">${esc(r.risk_summary)}</p>` : ""}
    <div class="rc-meta">
      ${asOf ? `<span class="chip">📅 Data as of ${esc(asOf)}</span>` : ""}
      ${r.bfe ? `<span class="chip">Base flood elevation: ${esc(r.bfe)} ft</span>` : ""}
      ${r.sfha ? `<span class="chip">SFHA: yes</span>` : `<span class="chip">SFHA: no</span>`}
    </div>
    ${est ? `<div class="rc-est">
      <div class="tiny" style="font-weight:800;letter-spacing:.08em;text-transform:uppercase">Typical NFIP cost (estimate)</div>
      <div class="amt">${esc(est)}<span class="cap">/year</span></div>
      <div class="cap">${esc(PREMIUM_FOOTNOTE)}</div>
    </div>` : ""}
    <p class="disclaimer">${esc(DISCLAIMER)}</p>
  </div>`;
}

export function warmingUpHTML() {
  return `<div class="state warn"><b>The lookup service is warming up.</b><br>
    We couldn't reach the flood-zone service just now — no result was invented.
    Try again in a moment, or check <a href="https://msc.fema.gov/portal" rel="noopener">FEMA's Map Service Center</a> directly.</div>`;
}

export function isTestMode() {
  return new URLSearchParams(location.search).get("test") === "1";
}
