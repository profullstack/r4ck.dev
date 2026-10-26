import { config } from '@r4ck/config';
import { Layout } from './Layout.jsx';

const day = (iso) => (iso ? new Date(iso).toUTCString().replace(/ \d\d:\d\d:\d\d GMT$/, '') : '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** /account/invites: your scarce invites, and your open affiliate link. */
export function InvitesPage({ user, data, made = null, notice, error }) {
  const { quota, invites, bonus_days: bonus, can_send: canSend, why_not: whyNot } = data;
  return (
    <Layout user={user} path="/account/invites" title="Invites">
      <header class="page-head">
        <h1>Invites</h1>
        <p class="muted">
          {plural(quota.left, 'invite')} left of {quota.total}. Each works once, for someone new.
          {bonus > 0
            ? ` When they make their account from the emailed link, you both get ${plural(bonus, 'day')} of the pass: no hourly allowance on the API, the CLI or MCP.`
            : ''}
        </p>
      </header>
      {notice ? <p class="notice ok">{notice}</p> : null}
      {error ? <p class="notice error">{error}</p> : null}
      {made ? (
        <section class="panel highlight">
          <h2>Your new invite</h2>
          <p class="muted small">Send the link to one person. It expires {day(made.expires_at)}.</p>
          <pre class="keybox">
            <code>{made.url}</code>
          </pre>
          <p>
            <button type="button" class="button primary small" data-copy={made.url}>
              Copy link
            </button>
          </p>
        </section>
      ) : null}
      <section class="panel">
        <h2>Make an invite</h2>
        {canSend ? (
          quota.left > 0 ? (
            <form method="post" action="/account/invites" class="inline-form">
              <input
                type="text"
                name="note"
                placeholder="Who is it for? (only you see this)"
                aria-label="Note"
                maxlength="80"
              />
              <button class="button primary small" type="submit">
                Make an invite
              </button>
            </form>
          ) : (
            <p class="muted">All used. They are meant to be scarce.</p>
          )
        ) : (
          <p class="muted">{whyNot}</p>
        )}
      </section>
      <section class="panel">
        <h2>Sent</h2>
        {invites.length ? (
          <ul class="rows">
            {invites.map((i) => (
              <li>
                <span>
                  <strong>{i.note || 'Invite'}</strong>{' '}
                  <span class="muted small">
                    {i.status === 'used'
                      ? `accepted ${day(i.used_at)}`
                      : i.status === 'open'
                        ? `open until ${day(i.expires_at)}`
                        : i.status}
                  </span>
                </span>
                {i.status === 'open' ? (
                  <form method="post" action={`/account/invites/${i.id}/revoke`}>
                    <button class="button ghost small" type="submit">
                      Withdraw
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">None yet. The link is shown once, when you make it.</p>
        )}
      </section>
      <section class="panel">
        <h2>Your link</h2>
        <p class="muted small">
          Open and unlimited, unlike invites: anyone who signs up after following it is recorded as
          yours (first touch).
        </p>
        <pre class="keybox">
          <code>{data.affiliate.url}</code>
        </pre>
        <p>
          <button type="button" class="button ghost small" data-copy={data.affiliate.url}>
            Copy link
          </button>
        </p>
      </section>
      <section class="panel">
        <h2>From a script</h2>
        <pre>
          <code>{`r4ck invites                 # list, quota\nr4ck invites create "for Sam"\ncurl -X POST -H "Authorization: Bearer r4k_…" ${config.siteUrl}/api/v1/invites`}</code>
        </pre>
      </section>
    </Layout>
  );
}

/** /i/<code>: what an invite is, before it is spent. */
export function InviteLanding({ user, code, status }) {
  const bonus = config.invites.bonusDays;
  const ok = status === 'ok';
  return (
    <Layout user={user} path="/i" title={ok ? 'You are invited' : 'Invite'}>
      <section class="auth">
        <h1>{ok ? 'You are invited to r4ck' : 'This invite cannot be used'}</h1>
        {ok ? (
          <>
            <p>
              r4ck is the server search engine built for agents: every VPS, bare metal, GPU and PaaS
              offer for sale, with one query across the page, the API, the CLI and MCP.
            </p>
            {bonus > 0 ? (
              <p>
                Make your account from this invite and you and the person who sent it both get{' '}
                <strong>{plural(bonus, 'day')} of the pass</strong>: no hourly allowance, 500 rows a
                page, bulk export.
              </p>
            ) : null}
            {user ? (
              <p class="notice">
                You are signed in already. Invites are for new accounts, so this one stays unused
                for someone else.
              </p>
            ) : (
              <p>
                <a class="button primary" href="/signup">
                  Create your account
                </a>
              </p>
            )}
            <p class="muted small">
              Invite <code>{code}</code>. It is remembered on this browser and carried on the
              sign-in link we email you, so opening that link on another device still counts.
            </p>
          </>
        ) : (
          <p class="muted">
            {status === 'used'
              ? 'It has already been used.'
              : status === 'expired'
                ? 'It has expired.'
                : status === 'revoked'
                  ? 'It was withdrawn.'
                  : 'It is not one we issued.'}{' '}
            You can still <a href="/signup">make an account</a>; it is free.
          </p>
        )}
      </section>
    </Layout>
  );
}

/** "Have a code?" plus the account's pass, on /settings. */
export function PassPanel({ pass }) {
  return (
    <section class="panel" id="redeem">
      <h2>Pass and codes</h2>
      {pass?.until ? (
        <>
          <p>
            Your account holds the pass until <strong>{new Date(pass.until).toUTCString()}</strong>:
            no hourly allowance and 500 rows a page on this browser, your keys, the CLI and MCP.
          </p>
          {pass.token ? (
            <details>
              <summary class="small">Pass token, for a script with no key</summary>
              <pre class="keybox">
                <code>{pass.token}</code>
              </pre>
              <p class="muted small">
                Send as <code>{pass.header}: cp_…</code> or <code>Authorization: Bearer cp_…</code>.
                Anyone holding it has the pass until it runs out.
              </p>
            </details>
          ) : null}
        </>
      ) : (
        <p class="muted small">
          No pass on this account. A pass is ${(config.x402.priceCents / 100).toFixed(2)} a day at{' '}
          <a href="/crawl">/crawl</a>, or comes with a code or an invite.
        </p>
      )}
      <form method="post" action="/settings/redeem" class="inline-form">
        <input
          type="text"
          name="code"
          placeholder="CR-XXXX-XXXX-XXXX-XXXX"
          aria-label="Have a code?"
          autocomplete="off"
          spellcheck="false"
          maxlength="64"
          required
        />
        <button class="button primary small" type="submit">
          Redeem
        </button>
      </form>
      <p class="muted small">
        Have a code? Redeem it here for days of the pass. Want to bring someone?{' '}
        <a href="/account/invites">Invites</a>.
      </p>
    </section>
  );
}

/** Admins: mint and revoke codes, on /settings. */
export function CodesPanel({ codes, freshCode }) {
  return (
    <section class="panel" id="codes">
      <h2>Credit codes (admin)</h2>
      {freshCode ? (
        <div class="highlight">
          <p class="muted small">
            New code, {plural(freshCode.days, 'day')} of pass. Shown once: copy it now.
          </p>
          <pre class="keybox">
            <code>{freshCode.code}</code>
          </pre>
          <p>
            <button type="button" class="button primary small" data-copy={freshCode.code}>
              Copy code
            </button>
          </p>
        </div>
      ) : null}
      <form method="post" action="/settings/credits" class="inline-form">
        <input type="number" name="days" min="1" max="3650" value="30" aria-label="Days" required />
        <input type="text" name="label" placeholder="Label (who it is for)" maxlength="120" />
        <input type="number" name="max" min="1" max="100000" value="1" aria-label="Uses" />
        <input
          type="number"
          name="expires_days"
          min="1"
          max="3650"
          placeholder="Expires in days"
          aria-label="Expires in days"
        />
        <button class="button primary small" type="submit">
          Mint
        </button>
      </form>
      {codes.length ? (
        <ul class="rows">
          {codes.slice(0, 50).map((k) => (
            <li>
              <span>
                <strong>{k.label || k.id}</strong>{' '}
                <span class="muted small">
                  {plural(k.days, 'day')} · {k.redemptions}/{k.max_redemptions} used
                  {k.revoked_at ? ' · revoked' : ''}
                  {k.expires_at ? ` · expires ${day(k.expires_at)}` : ''}
                </span>
              </span>
              {k.revoked_at ? null : (
                <form
                  method="post"
                  action={`/settings/credits/${k.id}/revoke`}
                  data-confirm="Revoke this code? Nobody can redeem it after this."
                >
                  <button class="button ghost small" type="submit">
                    Revoke
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted small">No codes yet.</p>
      )}
    </section>
  );
}
