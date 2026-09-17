import { config } from '@r4ck/config';
import { ago } from './home.jsx';
import { Layout } from './Layout.jsx';
import { AgentPanel } from './parts.jsx';

export function Deals({ user, deals }) {
  return (
    <Layout
      user={user}
      path="/deals"
      title="Hosting deals"
      description="Hosting deals and industry stories, as they are filed."
    >
      <header class="page-head">
        <h1>Deals and stories</h1>
        <p class="muted">
          From LowEndBox and every deal feed the hosting collection reads. A deal names its host; a
          story is editorial.
        </p>
      </header>
      <ul class="deal-list">
        {deals.map((d) => (
          <li class="deal">
            <span class={`badge ${d.kind === 'story' ? 'story' : 'deal'}`}>{d.kind}</span>
            <a href={d.url} rel="noopener nofollow" target="_blank">
              <strong>{d.title}</strong>
            </a>
            <p class="muted small clamp">{d.summary}</p>
            <span class="muted small">
              {d.source} · {ago(d.published_at)}
            </span>
          </li>
        ))}
      </ul>
      <AgentPanel
        agent={{
          url: `${config.siteUrl}/api/v1/deals`,
          curl: `curl -s '${config.siteUrl}/api/v1/deals'`,
          cli: 'r4ck deals',
          mcpJson: JSON.stringify(
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: { name: 'deals', arguments: {} },
            },
            null,
            2,
          ),
        }}
      />
    </Layout>
  );
}
