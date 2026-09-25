import { config } from '@r4ck/config';
import {
  BUCKETS,
  bucketActive,
  countryName,
  FACETS,
  fmtGb,
  fmtMoney,
  KIND_LABELS,
  outbound,
  paramsFrom,
  toggle,
  toggleBucket,
  without,
} from '@r4ck/core';
import { raw } from 'hono/html';

/** Shared pieces: the rack-unit row, facet rail, chips, agent panel, sparkline. */

/**
 * A link off the site to a provider.
 *
 * Routed through a referral endpoint where we have a deal with that provider,
 * and labelled as one when it is, because a reader is entitled to know which
 * links pay us. `rel` carries `sponsored` in that case, which is what search
 * engines ask for on a paid link.
 */
export function Outbound({ url, domain, class: cls, children }) {
  const out = outbound(url, domain);
  if (!out.href) return null;
  return (
    <a class={cls} href={out.href} rel={out.rel} target="_blank">
      {children}
      {out.affiliate ? <AffiliateMark /> : null}
    </a>
  );
}

export function AffiliateMark() {
  return (
    <span
      class="aff-mark"
      title="Affiliate link: r4ck.dev may earn a commission on an order. It buys no ranking and costs you nothing."
    >
      affiliate
    </span>
  );
}

export const flag = (code) =>
  /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '';

export function Price({ price, big = false }) {
  if (!price) return <span class="muted">n/a</span>;
  const est = price.monthly_usd;
  const billed =
    price.amount === null
      ? null
      : `${fmtMoney(price.amount, price.currency ?? 'USD')}${price.interval ? `/${short(price.interval)}` : ''}`;
  if (est === null) return <span class={big ? 'price-main' : 'price'}>{billed ?? 'ask'}</span>;
  return (
    <span class="price-wrap">
      <span class={big ? 'price-main' : 'price'} title="Estimated USD per month">
        {est === 0 ? 'Free' : `${fmtMoney(est, 'USD')}`}
        <small>/mo</small>
      </span>
      {price.estimate && billed ? (
        <span class="price-sub" title="As billed">
          {billed}
        </span>
      ) : null}
    </span>
  );
}
const short = (i) =>
  ({
    month: 'mo',
    year: 'yr',
    hour: 'hr',
    day: 'day',
    week: 'wk',
    quarter: 'qtr',
    biennial: '2yr',
    triennial: '3yr',
  })[i] ?? i;

export function KindBadge({ kind }) {
  return <span class={`badge kind-${kind}`}>{KIND_LABELS[kind] ?? kind}</span>;
}

export function Automation({ list = [], compact = false }) {
  const known = ['api', 'cli', 'terraform', 'mcp', 'iac'];
  const items = known.filter((k) => list.includes(k));
  if (items.length === 0)
    return compact ? null : <span class="muted small">no automation listed</span>;
  return (
    <span class="automation" title="Provider automation">
      {items.map((k) => (
        <span class={`auto auto-${k}`}>{k.toUpperCase()}</span>
      ))}
    </span>
  );
}

export function Spec({ label, value, max, unit = '' }) {
  const pct =
    value && max ? Math.min(100, Math.round((Math.log1p(value) / Math.log1p(max)) * 100)) : 0;
  return (
    <div class="spec">
      <span class="spec-label">{label}</span>
      <span class="spec-value">
        {value === null || value === undefined ? <span class="muted">·</span> : `${value}${unit}`}
      </span>
      <span class="bar" aria-hidden="true">
        <i style={`width:${pct}%`}></i>
      </span>
    </div>
  );
}

/** One result: a rack unit. */
export function Unit({ s, checkbox = true }) {
  const gpu = s.compute.gpu;
  return (
    <article class={`unit ${s.stock === 'out_of_stock' ? 'is-out' : ''}`} data-id={s.id}>
      <span
        class={`unit-led ${s.stock === 'in_stock' ? 'on' : s.stock === 'out_of_stock' ? 'off' : ''}`}
        title={`Stock: ${s.stock ?? 'unknown'}`}
      ></span>
      <div class="unit-main">
        <a class="unit-name" href={`/servers/${s.id}`}>
          {s.name}
        </a>
        <div class="unit-meta">
          <a class="unit-provider" href={`/providers/${s.provider.slug}`}>
            {s.provider.name}
          </a>
          <KindBadge kind={s.kind} />
          {gpu ? (
            <span class="badge gpu">
              {gpu.count && gpu.count > 1 ? `${gpu.count}× ` : ''}
              {gpu.model ?? 'GPU'}
            </span>
          ) : null}
          {s.compute.arch ? <span class="badge arch">{s.compute.arch}</span> : null}
          {s.location.countries.length ? (
            <span class="unit-places" title={s.location.countries.map((c) => c.name).join(', ')}>
              {s.location.countries
                .slice(0, 6)
                .map((c) => flag(c.code))
                .join(' ')}
              {s.location.countries.length > 6 ? ` +${s.location.countries.length - 6}` : ''}
            </span>
          ) : null}
          <Automation list={s.provider.automation} compact />
        </div>
      </div>
      <div class="unit-specs">
        <Spec label="vCPU" value={s.compute.vcpu} max={256} />
        <Spec label="RAM" value={s.compute.ram_gb} max={2048} unit=" GB" />
        <Spec
          label="Disk"
          value={s.storage.disk_gb === null ? null : fmtGb(s.storage.disk_gb).replace(' ', ' ')}
          max={10000}
        />
        <Spec
          label="Transfer"
          value={s.network.transfer_gb ? fmtGb(s.network.transfer_gb) : null}
          max={100000}
        />
      </div>
      <div class="unit-price">
        <Price price={s.price} />
      </div>
      <div class="unit-actions">
        {checkbox ? (
          <label class="compare-toggle" title="Add to compare">
            <input type="checkbox" data-compare={s.id} />
            <span>Compare</span>
          </label>
        ) : null}
        <a class="button small ghost" href={`/servers/${s.id}`}>
          Details
        </a>
      </div>
    </article>
  );
}

export function Chips({ chips, filters, base = '/servers' }) {
  if (!chips?.length) return null;
  return (
    <ul class="chips active-chips" aria-label="Active filters">
      {chips.map((c) => (
        <li>
          <a
            class="chip on"
            href={`${base}?${paramsFrom(without(filters, c.param, c.value))}`}
            title="Remove"
          >
            {c.label} <span aria-hidden="true">×</span>
          </a>
        </li>
      ))}
      <li>
        <a class="chip clear" href={base}>
          Clear all
        </a>
      </li>
    </ul>
  );
}

export function FacetRail({ facets, filters, base = '/servers' }) {
  if (!facets) return null;
  return (
    <div class="facet-rail">
      {FACETS.map((f) => {
        const values = facets[f.name] ?? [];
        if (
          values.length === 0 ||
          (values.length === 1 && !f.bucket && !isActive(filters, f, values[0].value))
        )
          return null;
        return (
          <details
            class="facet-group"
            open={['kind', 'price', 'vcpu', 'ram', 'country', 'gpu'].includes(f.name)}
          >
            <summary>{f.label}</summary>
            <ul>
              {values.map((v) => {
                const on = f.bucket
                  ? bucketActive(filters, f.name, v.value)
                  : isActive(filters, f, v.value);
                const next = f.bucket
                  ? toggleBucket(filters, f.name, v.value)
                  : toggle(filters, f.param, f.param === 'gpu' ? v.value === '1' : v.value, {
                      multi: Boolean(f.multi),
                    });
                const label = f.bucket
                  ? (BUCKETS[f.bucket].find((b) => b.key === v.value)?.label ?? v.value)
                  : facetLabel(f.name, v);
                return (
                  <li>
                    <a
                      class={`facet-item ${on ? 'on' : ''}`}
                      href={`${base}?${paramsFrom(next)}`}
                      rel="nofollow"
                    >
                      <span class="facet-check" aria-hidden="true"></span>
                      <span class="facet-label">{label}</span>
                      <span class="facet-count">{v.count}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
const isActive = (filters, f, value) => {
  const cur = filters[f.param];
  if (f.param === 'gpu') return cur === (value === '1');
  return Array.isArray(cur) ? cur.includes(value) : String(cur ?? '') === String(value);
};
function facetLabel(name, v) {
  if (name === 'kind') return KIND_LABELS[v.value] ?? v.value;
  if (name === 'country') return `${flag(v.value)} ${countryName(v.value)}`;
  if (name === 'gpu') return v.value === '1' ? 'With GPU' : 'No GPU';
  if (name === 'has') return v.value.toUpperCase();
  if (name === 'provider') return v.label ?? v.value;
  if (name === 'interval') return `per ${v.value}`;
  if (name === 'stock') return v.value.replace('_', ' ');
  return v.value;
}

/** The same query, in every language a caller speaks. */
export function AgentPanel({ agent, title = 'This page as data', open = false }) {
  if (!agent) return null;
  const tabs = [
    ['JSON', agent.url],
    ['curl', agent.curl],
    ['CLI', agent.cli],
    ['MCP', agent.mcpJson ?? JSON.stringify(agent.mcp ?? {}, null, 2)],
  ].filter(([, v]) => v);
  return (
    <details class="agent-panel" open={open}>
      <summary>
        <span class="agent-dot" aria-hidden="true"></span>
        {title}
        <span class="muted small">same query, four ways</span>
      </summary>
      <div class="tabs" data-tabs>
        <div class="tab-list" role="tablist">
          {tabs.map(([name], i) => (
            <button
              type="button"
              role="tab"
              aria-selected={i === 0 ? 'true' : 'false'}
              data-tab={name}
            >
              {name}
            </button>
          ))}
        </div>
        {tabs.map(([name, body], i) => (
          <div role="tabpanel" data-panel={name} hidden={i !== 0}>
            <pre>
              <code>{body}</code>
            </pre>
            <button type="button" class="button small ghost" data-copy={body}>
              Copy
            </button>
            {name === 'JSON' ? (
              <a class="button small ghost" href={body}>
                Open
              </a>
            ) : null}
            {name === 'JSON' && agent.csv ? (
              <a class="button small ghost" href={agent.csv}>
                CSV
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

export function Sparkline({ points, width = 320, height = 64 }) {
  const vals = points.map((p) => p.monthly_usd).filter((v) => v !== null);
  if (vals.length < 2)
    return (
      <p class="muted small">
        No price movement recorded yet. Each sync writes a point when the price changes.
      </p>
    );
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = width / (vals.length - 1);
  const d = vals
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 6 - ((v - min) / span) * (height - 12)).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      class="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Price from ${fmtMoney(vals[0])} to ${fmtMoney(vals.at(-1))}`}
    >
      <path d={d} fill="none" stroke="var(--accent)" stroke-width="2" />
      <circle
        cx={((vals.length - 1) * step).toFixed(1)}
        cy={(height - 6 - ((vals.at(-1) - min) / span) * (height - 12)).toFixed(1)}
        r="3.5"
        fill="var(--accent)"
      />
    </svg>
  );
}

export function Stat({ value, label, href }) {
  const inner = (
    <>
      <span class="stat-value">{value}</span>
      <span class="stat-label">{label}</span>
    </>
  );
  return href ? (
    <a class="stat" href={href}>
      {inner}
    </a>
  ) : (
    <div class="stat">{inner}</div>
  );
}

export function ProviderCard({ p }) {
  return (
    <a class="provider-card" href={`/providers/${p.slug}`}>
      <div class="provider-card-head">
        <span class="provider-mark" aria-hidden="true">
          {initials(p.name)}
        </span>
        <span class="provider-name">{p.name}</span>
        {p.country ? (
          <span class="muted small">
            {flag(p.country.code)} {p.country.code}
          </span>
        ) : null}
      </div>
      <p class="muted small clamp">{p.summary ?? p.domain ?? ''}</p>
      <div class="provider-card-foot">
        <Automation list={p.automation} />
        <span class="muted small">
          {p.servers ? `${p.servers} offers` : ''}
          {p.from_usd ? ` · from ${fmtMoney(p.from_usd)}/mo` : ''}
        </span>
      </div>
    </a>
  );
}
export const initials = (name) =>
  String(name ?? '?')
    .replace(/[^a-z0-9 ]/gi, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function Pager({ page, limit, total, params, base = '/servers' }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  const link = (n) => {
    const p = new URLSearchParams(params);
    p.set('page', String(n));
    return `${base}?${p}`;
  };
  return (
    <nav class="pager" aria-label="Pages">
      {page > 1 ? (
        <a class="button ghost" href={link(page - 1)}>
          ← Previous
        </a>
      ) : (
        <span></span>
      )}
      <span class="muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <a class="button ghost" href={link(page + 1)}>
          Next →
        </a>
      ) : (
        <span></span>
      )}
    </nav>
  );
}

export const Json = ({ data }) => raw(JSON.stringify(data));
export const site = config.siteUrl;
