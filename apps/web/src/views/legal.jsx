import { config } from '@r4ck/config';
import { Layout } from './Layout.jsx';

/**
 * /privacy and /terms.
 *
 * Every sentence is meant to be true of this repository: what an account
 * stores (migrations 0001 to 0005), the cookies the routes set, the services
 * called (Resend, CoinPay, CrawlProof, jsDelivr) and the MCP tools in
 * lib/mcp/tools.js. CoinPay sign-in is described only when it is configured.
 * Change the code, change this page.
 */

export const LEGAL_EFFECTIVE_DATE = 'November 11, 2026';
const OPERATOR = 'Profullstack, Inc., 16375 Bonnie Lane, Los Gatos, CA 95032, USA';
const CONTACT = 'support@profullstack.com';

const coinpaySignIn = () =>
  Boolean(config.coinpayOAuth.clientId && config.coinpayOAuth.clientSecret);

function Head({ title, lede }) {
  return (
    <header class="page-head">
      <h1>{title}</h1>
      <p class="muted">
        Effective date: {LEGAL_EFFECTIVE_DATE}. {lede}
      </p>
    </header>
  );
}

const Mail = () => <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

export function Privacy({ user }) {
  const site = config.siteUrl;
  const coinpay = coinpaySignIn();
  return (
    <Layout
      user={user}
      path="/privacy"
      title="Privacy Policy"
      description="What r4ck stores, why, and who else is involved, including its API and MCP server."
    >
      <Head title="Privacy Policy" lede="What r4ck stores, why, and who else is involved." />
      <section class="panel legal">
        <p>This policy covers r4ck.dev, its API, CLI and MCP server. r4ck is run by {OPERATOR}.</p>

        <h2>1. Without an account</h2>
        <p>
          Searching and reading the catalogue needs no account. API and MCP requests without a key
          are counted per IP address in hourly buckets, for the free allowance, and the site applies
          a per-minute rate limit by address. The server catalogue itself is public data about
          hosting offers, not about you.
        </p>

        <h2>2. What an account stores</h2>
        <ul>
          <li>
            <strong>Your email address</strong>, which is how you sign in: we email you a link, and
            there is no password. A sign-in link is stored only as a hash and expires after 20
            minutes.
          </li>
          <li>
            <strong>Your profile:</strong> the fields you fill in when you sign up or later (first
            and last name, company domain, job title, LinkedIn URL). They are private to your
            account.
          </li>
          <li>
            <strong>Sessions:</strong> a random session ID, its expiry (90 days) and your browser's
            user agent. <strong>Passkeys</strong>, if you add one: the public key, a signature
            counter and the transports your device reported; the private key never leaves your
            device.
          </li>
          <li>
            <strong>API keys:</strong> a hash of each key with its prefix, name, permissions and
            expiry.
          </li>
          <li>
            <strong>Saved searches</strong> (a name and the query) and <strong>webhooks</strong>{' '}
            (the endpoint URLs, signing secrets and event filters you set, and a log of deliveries).
          </li>
          <li>
            <strong>Passes, codes and invites:</strong> the x402 pass days on your account, credit
            codes you redeem, invites you create or accept, and a salted hash (never the address
            itself) of the IP address an invite was made from, used to stop self-referral. If you
            arrived through a referral link, the referral code is recorded on your new account.
          </li>
          {coinpay ? (
            <li>
              <strong>Linked CoinPay account</strong>, if you sign in with CoinPay: the identifier,
              email, name and OpenProfile URL CoinPay gives us.
            </li>
          ) : null}
          <li>
            <strong>When you were last active</strong>, and your role (user or admin).
          </li>
        </ul>

        <h2>3. Cookies</h2>
        <p>
          Signing in sets one session cookie, HttpOnly and SameSite=Lax, sent only over HTTPS.
          Adding or using a passkey sets a short-lived cookie for the challenge.
          {coinpay ? ' Signing in with CoinPay sets a short-lived cookie for the round trip.' : ''}{' '}
          Arriving through a referral link stores the referral code in a cookie for 30 days, and an
          invite link keeps its code in a cookie until it is used or expires. r4ck sets no
          advertising cookies.
        </p>

        <h2>4. Who else is involved</h2>
        <ul>
          <li>
            <strong>Resend</strong> delivers sign-in emails, so it processes your email address.
          </li>
          <li>
            <strong>CoinPay</strong> (coinpayportal.com) settles x402 passes, paid in USDC
            {coinpay ? ', and handles Sign in with CoinPay' : ''}. We record the payment reference,
            amount, payer and pass expiry, never wallet keys.
          </li>
          <li>
            <strong>CrawlProof</strong> (crawlproof.com) supplies page statistics through a script
            on each page.
          </li>
          <li>
            <strong>jsDelivr</strong> serves the WebMCP script, which offers r4ck's search to an AI
            agent running in your browser.
          </li>
          <li>
            <strong>Your webhook endpoints</strong> receive the events you subscribe them to.
          </li>
        </ul>
        <p>
          Scripts loaded from other services receive your IP address and browser details when your
          browser loads them. Nothing is sold, and no advertising profile is built from you.
        </p>

        <h2>5. What is public</h2>
        <p>
          Nothing about your account is public. The catalogue of providers, servers, prices and
          deals is public, under the licenses shown in the footer.
        </p>

        <h2>6. AI agents and MCP</h2>
        <p>
          The MCP server is at <code>{site}/mcp</code> (also <code>{site}/api/mcp</code>), over
          Streamable HTTP. Without a key, an MCP client can use the read-only catalogue tools:
          search servers, find the cheapest match, parse a query, read and compare servers, list
          facets, providers and deals, and read the catalogue's stats. These count against the
          hourly allowance for your IP address, or are unmetered with an x402 pass. With an API key
          (<code>Authorization: Bearer r4k_...</code>, made on your settings page) it can also act
          on your account: save, list and delete saved searches, redeem a credit code, list and
          create invites, and manage webhooks (create, update, delete, test, rotate the signing
          secret, read deliveries).
        </p>
        <p>
          MCP and API requests are logged (time, tool or route, IP address, and the account or key
          if any) for abuse prevention and rate limiting. No MCP data is sold or used for
          advertising.
        </p>

        <h2>7. Keeping and deleting it</h2>
        <p>
          Sign-in links expire after 20 minutes and sessions after 90 days; signing out ends a
          session at once. You can revoke API keys, remove passkeys, delete saved searches and
          webhooks at any time, and delete your account yourself from your settings page, which
          removes it with its sessions, passkeys, keys, saved searches, webhooks, passes and
          profile. For anything else, email <Mail />.
        </p>

        <h2>8. Security</h2>
        <p>
          Data travels over TLS. Sign-in links and API keys are stored only as hashes. No system is
          perfectly secure, and we cannot guarantee absolute security.
        </p>

        <h2>9. Children</h2>
        <p>
          r4ck is not directed at children under 13, and we do not knowingly collect personal
          information from them.
        </p>

        <h2>10. Your rights</h2>
        <p>
          Depending on where you live, you may have the right to access, correct, delete or export
          your personal data. Contact us to exercise them.
        </p>

        <h2>11. Changes</h2>
        <p>
          If r4ck changes what it collects, this page changes with it. The effective date above says
          when it last did.
        </p>

        <h2>12. Contact</h2>
        <p>
          {OPERATOR}. Email <Mail />.
        </p>
      </section>
    </Layout>
  );
}

export function Terms({ user }) {
  const site = config.siteUrl;
  return (
    <Layout
      user={user}
      path="/terms"
      title="Terms of Service"
      description="The terms for using r4ck, its API and its MCP server."
    >
      <Head title="Terms of Service" lede="The terms for using r4ck, its API and its MCP server." />
      <section class="panel legal">
        <h2>1. Acceptance of terms</h2>
        <p>
          By using r4ck.dev, its API, CLI or MCP server (the "Service"), run by {OPERATOR}, you
          agree to these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2>2. The Service</h2>
        <p>
          r4ck is a search over dedicated server and VPS offers from many hosting providers. Reading
          is free. A free account adds API keys, saved searches and webhooks. An x402 pass removes
          the hourly allowance.
        </p>

        <h2>3. Accounts</h2>
        <p>
          Your account is your email address. You are responsible for keeping that inbox, your
          passkeys and your API keys safe, and for all activity under your account. Tell us at once
          if you think someone else is using it.
        </p>

        <h2>4. Payments</h2>
        <p>
          x402 passes are paid in USDC and settled through CoinPay. A pass covers the days it was
          bought for.
        </p>

        <h2>5. The data</h2>
        <p>
          Offers, prices and provider details come from providers' own catalogues and public
          registers, and prices in USD are estimates from daily exchange rates. They can be stale,
          wrong or missing; check with the provider before you buy. Nothing here is a recommendation
          or an endorsement of any provider. Catalogue data is offered under the licenses shown in
          the footer.
        </p>

        <h2>6. Acceptable use</h2>
        <p>
          Do not use the Service for anything unlawful, and do not send automated traffic heavy
          enough to degrade it for anyone else. The API, the CSV export and the x402 pass are there
          so you do not have to scrape; AI training crawlers pay for a pass, as the site explains
          when they arrive.
        </p>

        <h2>7. MCP and API use</h2>
        <p>
          The same rules apply to the API and the MCP server at <code>{site}/mcp</code>. An agent
          using your key acts as you, and what it does is your responsibility. Requests are
          rate-limited, and keys used for abuse may be revoked.
        </p>

        <h2>8. Intellectual property</h2>
        <p>
          The r4ck name, site and service belong to Profullstack, Inc. or its licensors. The r4ck
          source code is open source under the MIT license.
        </p>

        <h2>9. Disclaimer of warranties</h2>
        <p>
          The Service is provided "as is" without warranties of any kind. We do not guarantee that
          it will be uninterrupted, secure or error-free.
        </p>

        <h2>10. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Profullstack, Inc. shall not be liable for any
          indirect, incidental, special, consequential or punitive damages arising out of your use
          of the Service.
        </p>

        <h2>11. Changes to these terms</h2>
        <p>
          We may update these Terms from time to time. Continued use of the Service after a change
          means you accept the revised Terms.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about these Terms? Email <Mail />.
        </p>
      </section>
    </Layout>
  );
}
