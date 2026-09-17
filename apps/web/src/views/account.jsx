import { config } from '@r4ck/config';
import { ago } from './home.jsx';
import { Layout } from './Layout.jsx';

export function SignIn({ mode = 'login', next, sent = false, error, user = null }) {
  const signup = mode === 'signup';
  return (
    <Layout
      user={user}
      path={signup ? '/signup' : '/login'}
      title={signup ? 'Create an account' : 'Sign in'}
    >
      <section class="auth">
        <h1>{signup ? 'Create an account' : 'Sign in'}</h1>
        <p class="muted">
          {signup
            ? 'An account is an email address. We send a link; opening it makes the account and signs you in. Add a passkey after that for the fast way back.'
            : 'A link by email, or a passkey if you have one here. No passwords.'}
        </p>
        {error ? <p class="notice error">{error}</p> : null}
        {sent ? (
          <p class="notice ok">
            If that address can receive mail, a sign-in link is on its way. It works once and
            expires in 20 minutes.
          </p>
        ) : (
          <>
            <form method="post" action="/api/auth/magic" class="stack">
              <input type="hidden" name="next" value={next ?? '/settings'} />
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  required
                  autocomplete="email"
                  placeholder="you@example.com"
                />
              </label>
              <button class="button primary" type="submit">
                {signup ? 'Send me a link' : 'Email me a link'}
              </button>
            </form>
            {!signup ? (
              <div class="stack">
                <button type="button" class="button ghost" id="passkey-signin">
                  Sign in with a passkey
                </button>
                <p class="muted small" id="passkey-signin-msg" aria-live="polite"></p>
              </div>
            ) : null}
          </>
        )}
        <p class="muted small">
          {signup ? (
            <>
              Already have one? <a href="/login">Sign in</a>.
            </>
          ) : (
            <>
              New here? <a href="/signup">Create an account</a>.
            </>
          )}{' '}
          Every key you make has {config.api.keyPerHour.toLocaleString()} requests an hour, free.
        </p>
      </section>
    </Layout>
  );
}

export function Settings({ user, keys, passkeys, saved, freshKey, notice, error }) {
  return (
    <Layout user={user} path="/settings" title="Settings">
      <header class="page-head">
        <h1>Settings</h1>
        <p class="muted">
          {user.email}
          {user.role === 'admin' ? ' · admin' : ''}
        </p>
      </header>
      {notice ? <p class="notice ok">{notice}</p> : null}
      {error ? <p class="notice error">{error}</p> : null}
      {freshKey ? (
        <section class="panel highlight">
          <h2>Your new key</h2>
          <p class="muted small">Shown once. Copy it now.</p>
          <pre class="keybox">
            <code>{freshKey}</code>
          </pre>
          <p>
            <button type="button" class="button primary small" data-copy={freshKey}>
              Copy key
            </button>
          </p>
          <pre>
            <code>{`r4ck login   # paste it\ncurl -H "Authorization: Bearer ${freshKey}" ${config.siteUrl}/api/v1/me`}</code>
          </pre>
        </section>
      ) : null}
      <div class="detail-grid">
        <section class="panel">
          <h2>API keys</h2>
          <p class="muted small">
            For the CLI, MCP clients and scripts. {config.api.keyPerHour.toLocaleString()} requests
            an hour, {config.api.keyMaxLimit} rows a page, CSV export. Send as{' '}
            <code>Authorization: Bearer r4k_…</code>.
          </p>
          {keys.length ? (
            <ul class="rows">
              {keys.map((k) => (
                <li>
                  <span>
                    <code>{k.prefix}…</code> <strong>{k.name}</strong>
                  </span>
                  <span class="muted small">
                    made {ago(k.createdAt)}
                    {k.lastUsedAt ? ` · used ${ago(k.lastUsedAt)}` : ' · never used'}
                  </span>
                  <form
                    method="post"
                    action={`/api/keys/${k.id}/revoke`}
                    data-confirm="Revoke this key? Anything using it stops working."
                  >
                    <button class="button ghost small" type="submit">
                      Revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p class="muted">No keys yet.</p>
          )}
          <form method="post" action="/api/keys" class="inline-form">
            <input
              type="text"
              name="name"
              placeholder="Name (laptop, ci, claude)"
              aria-label="Key name"
              maxlength="60"
            />
            <button class="button primary small" type="submit">
              Make a key
            </button>
          </form>
        </section>
        <section class="panel">
          <h2>Passkeys</h2>
          <p class="muted small">
            The fast way back on this device. The emailed link stays as the way in when a device is
            lost.
          </p>
          {passkeys.length ? (
            <ul class="rows">
              {passkeys.map((p) => (
                <li>
                  <span>
                    <code>{String(p.credential_id).slice(0, 10)}…</code>
                  </span>
                  <span class="muted small">
                    added {ago(p.created_at)}
                    {p.last_used_at ? ` · used ${ago(p.last_used_at)}` : ''}
                  </span>
                  <form method="post" action="/api/auth/passkey/remove">
                    <input type="hidden" name="credential_id" value={p.credential_id} />
                    <button class="button ghost small" type="submit">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p class="muted">No passkeys on this account.</p>
          )}
          <p>
            <button type="button" class="button ghost small" id="add-passkey">
              Add a passkey
            </button>{' '}
            <span class="muted small" id="add-passkey-msg" aria-live="polite"></span>
          </p>
        </section>
      </div>
      <section class="panel">
        <h2>Saved searches</h2>
        {saved.length ? (
          <ul class="rows">
            {saved.map((s) => (
              <li>
                <a href={s.html}>
                  <strong>{s.name}</strong>
                </a>
                <span class="muted small mono">{s.cli}</span>
                <form method="post" action={`/api/saved/${s.id}/delete`}>
                  <button class="button ghost small" type="submit">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">
            Nothing saved. Run a search and use "Save search" under the results, or the{' '}
            <code>save_search</code> MCP tool.
          </p>
        )}
      </section>
      <section class="panel">
        <h2>Agents</h2>
        <pre>
          <code>{`npm i -g @profullstack/r4ck\nr4ck login                      # paste a key once\nclaude mcp add r4ck -- r4ck mcp   # every tool in Claude Code\n\n# or point any MCP client at ${config.siteUrl}/mcp with the key as a bearer`}</code>
        </pre>
      </section>
      <section class="panel danger">
        <h2>Sign out and delete</h2>
        <div class="inline-form">
          <form method="post" action="/api/auth/logout">
            <button class="button ghost small" type="submit">
              Sign out
            </button>
          </form>
          <form
            method="post"
            action="/api/account/delete"
            data-confirm="Delete your account, keys, passkeys and saved searches? This cannot be undone."
          >
            <button class="button danger small" type="submit">
              Delete account
            </button>
          </form>
        </div>
      </section>
    </Layout>
  );
}
