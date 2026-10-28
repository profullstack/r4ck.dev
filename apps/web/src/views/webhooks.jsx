import { config } from '@r4ck/config';
import { ago } from './home.jsx';

/**
 * Settings: webhook endpoints for this account (@profullstack/webhooks). The
 * same things as /api/v1/webhooks, `r4ck webhooks` and the *_webhook MCP tools.
 */
export function WebhooksPanel({ webhooks }) {
  if (!webhooks) return null;
  const { endpoints, deliveries, eventTypes, help, fresh } = webhooks;
  return (
    <section class="panel" id="webhooks">
      <h2>Webhooks</h2>
      <p class="muted small">
        Signed POSTs to your URL when something happens on your account: a CloudEvents JSON body
        with <code>webhook-id</code>, <code>webhook-timestamp</code> and{' '}
        <code>webhook-signature</code> headers (Standard Webhooks; verify with any Standard Webhooks
        library). Retried for about three days. Saved searches are what you watch.
      </p>
      {fresh ? (
        <div class="panel highlight">
          <h3>{fresh.rotated ? 'New signing secret' : 'Webhook added'}</h3>
          <p class="muted small">
            Signing secret for <code>{fresh.url}</code>. Shown once here; also at{' '}
            <code>GET /api/v1/webhooks/:id/secret</code>.
          </p>
          <pre class="keybox">
            <code>{fresh.secret}</code>
          </pre>
          <p>
            <button type="button" class="button primary small" data-copy={fresh.secret}>
              Copy secret
            </button>
          </p>
        </div>
      ) : null}
      {endpoints.length ? (
        <ul class="rows">
          {endpoints.map((e) => (
            <li>
              <span>
                <code>{e.url}</code> {e.description ? <strong>{e.description}</strong> : null}
              </span>
              <span class="muted small">
                {e.events.join(', ')} ·{' '}
                {e.enabled ? 'on' : `off${e.disabled_reason ? ` (${e.disabled_reason})` : ''}`}
                {e.failures ? ` · ${e.failures} failures in a row` : ''} · added {ago(e.created_at)}
              </span>
              <span class="inline-form">
                <form method="post" action={`/settings/webhooks/${e.id}/test`}>
                  <button class="button ghost small" type="submit">
                    Test
                  </button>
                </form>
                <form method="post" action={`/settings/webhooks/${e.id}/toggle`}>
                  <button class="button ghost small" type="submit">
                    {e.enabled ? 'Pause' : 'Switch on'}
                  </button>
                </form>
                <form
                  method="post"
                  action={`/settings/webhooks/${e.id}/rotate`}
                  data-confirm="Replace the signing secret? The old one stops working at once."
                >
                  <button class="button ghost small" type="submit">
                    Rotate secret
                  </button>
                </form>
                <form
                  method="post"
                  action={`/settings/webhooks/${e.id}/delete`}
                  data-confirm="Remove this webhook and its delivery log?"
                >
                  <button class="button ghost small" type="submit">
                    Remove
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted">No webhooks yet.</p>
      )}
      <form method="post" action="/settings/webhooks" class="stack">
        <input
          type="url"
          name="url"
          required
          placeholder="https://example.com/hooks/r4ck"
          aria-label="Webhook URL"
        />
        <input
          type="text"
          name="description"
          maxlength="200"
          placeholder="What it is (optional)"
          aria-label="Description"
        />
        <fieldset>
          <legend class="small">Events (none ticked = all)</legend>
          {eventTypes.map((t) => (
            <label class="small">
              <input type="checkbox" name="events" value={t} /> <code>{t}</code>{' '}
              <span class="muted">{help[t]}</span>
            </label>
          ))}
        </fieldset>
        <button class="button primary small" type="submit">
          Add webhook
        </button>
      </form>
      {deliveries.length ? (
        <>
          <h3>Recent deliveries</h3>
          <ul class="rows">
            {deliveries.map((d) => (
              <li>
                <span>
                  <code>{d.event_type}</code> {d.status}
                </span>
                <span class="muted small">
                  {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                  {d.last_status ? ` · HTTP ${d.last_status}` : ''}
                  {d.last_error ? ` · ${d.last_error}` : ''} · {ago(d.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <pre>
        <code>{`r4ck webhooks add https://example.com/hooks/r4ck --events server.price_dropped\ncurl -H "Authorization: Bearer r4k_…" ${config.siteUrl}/api/v1/webhooks`}</code>
      </pre>
    </section>
  );
}
