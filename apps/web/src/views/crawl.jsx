import { Layout } from './Layout.jsx';

/**
 * The x402 sales page, /crawl, in the site's own shell.
 *
 * The gateway ships a bare page of its own, unstyled and shell-less, and that
 * is what /crawl looked like until now. This is the same page with the same
 * words, rendered through the Layout like every other route, so the one URL a
 * refused crawler may read looks like the site it was refused from. Every
 * number on it comes from the gateway's context; nothing is typed twice.
 *
 * Two audiences reach it and they need different first sentences. A training
 * crawler is here because it is on a list. A heavy reader is here because it
 * ran out of the free allowance, and telling that one it is a training crawler
 * is both wrong and insulting. The price is the same; the argument is not.
 */
export function Crawl({ ctx }) {
  const {
    siteName,
    siteUrl,
    buyUrl,
    price,
    minutes,
    header,
    enabled,
    offer,
    training = [],
    retrieval = [],
    contact,
    days = 1,
    total = price,
    maxDays = 30,
    quota = null,
    benefits = null,
  } = ctx;

  const throttled = Boolean(quota?.exceeded);
  const window =
    minutes === 1440
      ? 'one day'
      : minutes % 1440 === 0
        ? `${minutes / 1440} days`
        : minutes === 60
          ? 'one hour'
          : minutes % 60 === 0
            ? `${minutes / 60} hours`
            : `${minutes} minutes`;
  const networks = (offer?.accepts ?? []).map((a) => a.network).join(', ');

  return (
    <Layout
      path="/crawl"
      title="Crawl pass"
      description={`A day of unmetered access to ${siteName} for ${price}, paid over x402 and settled in USDC.`}
      head={<meta name="robots" content="noindex" />}
    >
      <header class="page-head">
        <h1>
          {throttled
            ? 'You have used up the free allowance.'
            : 'Training crawlers pay for access here.'}
        </h1>
        {throttled ? (
          <p class="muted">
            {quota.requests} requests every {quota.windowSeconds} seconds are free, no key and no
            account, and that is not changing. You have gone past it
            {quota.resetSeconds ? `, and it resets in ${quota.resetSeconds} seconds` : ''}. A pass
            lifts the limit rather than waiting it out.
          </p>
        ) : (
          <p class="muted">
            People read <a href={siteUrl}>{siteName}</a> free. So do search engines and the
            retrieval crawlers behind AI answers, because they send readers back. A crawler that
            copies pages into a training corpus sends nobody back, so it pays for the time it
            spends.
          </p>
        )}
      </header>

      <section class="tier featured">
        <h2>x402 pass</h2>
        <p class="tier-price">
          {days > 1 ? total : price}{' '}
          <span class="muted small">
            for {days > 1 ? `${days} × ${window}` : window} of requests
          </span>
        </p>
        {days > 1 ? (
          <p class="muted">
            This offer is for {days} days at {price} a day. The plain page at <code>{buyUrl}</code>{' '}
            quotes one.
          </p>
        ) : (
          <p class="muted">
            Want longer? Add <code>{'?days=<n>'}</code> to this URL for an offer of up to {maxDays}{' '}
            days at {price} a day, or simply pay a whole multiple of the price: the pass lasts as
            many days as you paid for.
          </p>
        )}
        {!enabled ? (
          <p>
            <strong>Payments are not switched on here yet.</strong> The offer below is empty until
            the operator configures a payout address, so for now this crawler is simply refused.
          </p>
        ) : null}
        {benefits?.length ? (
          <ul>
            {benefits.map((b) => (
              <li>{b}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {throttled ? (
        <section class="panel">
          <h2>Before you reach for a proxy pool</h2>
          <p class="muted">
            Spreading the same crawl over rotating addresses works, and it is the expensive way to
            do this. Residential bandwidth is sold by the gigabyte, you still fetch every page one
            at a time, and the bill starts on the first day. A pass is {price} a day, flat, with no
            rotation to maintain and nothing to keep working. We would rather sell you access than
            play that game, which is why the limit answers with a price instead of a refusal.
          </p>
        </section>
      ) : null}

      <section class="panel">
        <h2>How it works</h2>
        <ol class="docs-list">
          <li>
            Any page you fetch answers <code>402 Payment Required</code>. This page, fetched with{' '}
            <code>Accept: application/json</code>, returns the x402 offer: USDC, <code>exact</code>{' '}
            scheme, on {networks || 'Base, Polygon or Ethereum'}.
          </li>
          <li>
            Sign the payment and retry with the proof in an <code>X-PAYMENT</code> header. The
            response is a JSON receipt carrying a pass.
          </li>
          <li>
            Send the pass in <code>{header}</code> on every request until it expires: {window} per
            day paid, so a proof for three times the price buys three. When it expires, buy another.
            The sale is the pass, not the page: fetch the page again with the pass.
          </li>
        </ol>
      </section>

      <section class="panel">
        <h2>Pay with the CoinPay CLI</h2>
        <p>
          Settlement is by CoinPay: the buyer's USDC goes straight to the site's wallet and
          CoinPay's relayer pays the gas, so you need USDC and nothing else.
        </p>
        <pre>
          <code>{`npm install -g @profullstack/coinpay
coinpay x402 pay ${buyUrl} --output pass.json
# or a week at once:
coinpay x402 pay "${buyUrl}?days=7" --output pass.json`}</code>
        </pre>
        <p>
          The command fetches this page, reads the offer, opens a browser tab to approve the payment
          with the CoinPay Wallet extension or any EIP-6963 wallet (MetaMask, Rabby, Coinbase
          Wallet), and writes the receipt to <code>pass.json</code>. Then:
        </p>
        <pre>
          <code>{`PASS=$(node -p "require('./pass.json').pass")
curl -H "${header}: $PASS" ${siteUrl}/`}</code>
        </pre>
      </section>

      <section class="panel">
        <h2>Pay from your own x402 client</h2>
        <pre>
          <code>{`curl -sS -H "Accept: application/json" ${buyUrl}
# 402 with { "x402Version": 2, "accepts": [ ... ] }
# sign an EIP-3009 transferWithAuthorization for one entry, then:
curl -sS -H "X-PAYMENT: <base64 proof>" ${buyUrl}
# 200 with { "ok": true, "pass": "cp_...", "expires_at": "...", "days": 1, "header": "${header}" }`}</code>
        </pre>
        <p class="muted">
          The days a proof buys are read off the value it authorizes: a whole multiple of the
          one-day amount, up to {maxDays}. <code>{'?days=<n>'}</code> only changes what the offer
          quotes, so a standard client that pays exactly what is asked gets <em>n</em> days.
        </p>
        <p class="muted">
          The proof is x402 v2 in CoinPay's dialect:{' '}
          <code>
            {
              '{ x402Version: 2, scheme: "exact", network: "<CAIP-2>", payload: { signature, authorization } }'
            }
          </code>
          , base64-encoded. A proof is single-use; retrying with the same one returns the same pass,
          not a second charge.
        </p>
      </section>

      <section class="panel">
        <h2>Who pays and who does not</h2>
        <table class="docs-table">
          <tbody>
            <tr>
              <td>
                <strong>Charged</strong>
              </td>
              <td>{training.join(', ')}</td>
            </tr>
            <tr>
              <td>
                <strong>Free, named in robots.txt</strong>
              </td>
              <td>{retrieval.join(', ')}</td>
            </tr>
            <tr>
              <td>
                <strong>Free</strong>
              </td>
              <td>
                Everyone else: people, Googlebot, Applebot, Bingbot and any crawler not on the first
                line.
              </td>
            </tr>
          </tbody>
        </table>
        <p class="muted">
          If your crawler is on the first line and you believe it should not be, or you want more
          than an hour at a time,{' '}
          {contact ? <a href={contact}>get in touch</a> : 'contact the site'}.
        </p>
      </section>

      <details class="tool">
        <summary>The offer, verbatim</summary>
        <pre>
          <code>{JSON.stringify(offer, null, 2)}</code>
        </pre>
      </details>

      <p class="muted small">
        Served by @profullstack/x402-gateway. This page is <code>noindex</code> and is the one URL a
        refused crawler may read.
      </p>
    </Layout>
  );
}

/**
 * The page as a string, for the gateway's `page` hook.
 *
 * The hook is synchronous: the gateway hands what it returns straight to a
 * Response. The Layout and this view are plain markup, so the render never
 * yields a promise; the check below turns a future async slip into a loud
 * failure in the test rather than "[object Promise]" on a live page.
 */
export function renderCrawl(ctx) {
  const html = (<Crawl ctx={ctx} />).toString();
  if (typeof html !== 'string') throw new Error('the crawl page rendered asynchronously');
  return `<!doctype html>${html}`;
}
