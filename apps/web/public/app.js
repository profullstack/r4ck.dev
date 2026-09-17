/* r4ck client: theme, command palette with live parsing, compare bar, tabs,
   copy, passkeys, confirms, service worker. Plain script, no module graph. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    },
  };

  /* theme */
  const root = document.documentElement;
  const saved = store.get('theme');
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  else if (matchMedia('(prefers-color-scheme: light)').matches) root.dataset.theme = 'light';
  $('[data-theme-toggle]')?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    store.set('theme', root.dataset.theme);
  });

  /* live parsing under any omnibox */
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  const chip = (label, on = true) => {
    const s = document.createElement('span');
    s.className = `chip ${on ? 'on' : ''}`;
    s.textContent = label;
    return s;
  };
  async function parse(q) {
    const r = await fetch(`/api/v1/parse?q=${encodeURIComponent(q)}`, {
      headers: { accept: 'application/json' },
    });
    return r.ok ? r.json() : null;
  }
  for (const input of $$('[data-omni]')) {
    const form = input.closest('form');
    const out = form?.querySelector('[data-understood]');
    const results = form?.querySelector('[data-palette-results]');
    if (!out && !results) continue;
    const run = debounce(async () => {
      const q = input.value.trim();
      if (!q) {
        if (out) out.replaceChildren();
        if (results) results.replaceChildren();
        return;
      }
      const p = await parse(q);
      if (!p || input.value.trim() !== q) return;
      if (out) {
        out.replaceChildren();
        for (const c of p.chips) out.append(chip(c.label));
        if (p.rest) out.append(chip(`text: ${p.rest}`, false));
      }
      if (results) {
        const r = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=6`, {
          headers: { accept: 'application/json' },
        });
        if (!r.ok || input.value.trim() !== q) return;
        const data = await r.json();
        results.replaceChildren();
        for (const s of data.servers) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = `/servers/${s.id}`;
          const left = document.createElement('span');
          left.innerHTML = `<strong></strong> <span class="muted"></span>`;
          left.querySelector('strong').textContent = `${s.provider.name} ${s.name}`;
          left.querySelector('.muted').textContent = [
            s.compute.vcpu ? `${s.compute.vcpu} vCPU` : null,
            s.compute.ram_gb ? `${s.compute.ram_gb} GB` : null,
            s.kind,
          ]
            .filter(Boolean)
            .join(' · ');
          const right = document.createElement('span');
          right.className = 'mono';
          right.textContent =
            s.price.monthly_usd === null ? '' : `$${Number(s.price.monthly_usd).toFixed(2)}/mo`;
          a.append(left, right);
          li.append(a);
          results.append(li);
        }
        const all = document.createElement('li');
        all.innerHTML = `<a href="/servers?q=${encodeURIComponent(q)}"><span>See all ${data.total.toLocaleString()} results →</span><span></span></a>`;
        results.append(all);
      }
    }, 180);
    input.addEventListener('input', run);
  }

  /* command palette */
  const palette = $('#palette');
  const openPalette = () => {
    if (!palette) return;
    palette.showModal();
    const i = palette.querySelector('input');
    i.value = '';
    i.focus();
  };
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette?.open ? palette.close() : openPalette();
    }
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault();
      openPalette();
    }
  });
  $$('.topsearch input').forEach((i) =>
    i.addEventListener('focus', (e) => {
      if (matchMedia('(min-width: 52rem)').matches) {
        e.target.blur();
        openPalette();
      }
    }),
  );
  palette?.addEventListener('click', (e) => {
    if (e.target === palette) palette.close();
  });
  palette?.addEventListener('keydown', (e) => {
    const items = $$('[data-palette-results] a', palette);
    if (!items.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    const cur = items.findIndex((a) => a.getAttribute('aria-selected') === 'true');
    if (e.key === 'Enter' && cur >= 0) {
      e.preventDefault();
      location.href = items[cur].href;
      return;
    }
    if (e.key === 'Enter') return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur - 1);
    items.forEach((a, i) => a.setAttribute('aria-selected', i === next ? 'true' : 'false'));
    items[next].scrollIntoView({ block: 'nearest' });
  });

  /* keyboard on result lists: j/k move, enter opens, c compares */
  const units = $$('.unit');
  if (units.length) {
    let idx = -1;
    document.addEventListener('keydown', (e) => {
      if (/input|textarea|select/i.test(document.activeElement?.tagName ?? '') || palette?.open)
        return;
      if (!['j', 'k', 'Enter', 'c'].includes(e.key)) return;
      if (e.key === 'j') idx = Math.min(units.length - 1, idx + 1);
      if (e.key === 'k') idx = Math.max(0, idx - 1);
      units.forEach((u, i) => u.classList.toggle('is-focus', i === idx));
      if (idx < 0) return;
      const u = units[idx];
      if (e.key === 'j' || e.key === 'k') {
        u.scrollIntoView({ block: 'center' });
        u.style.outline = '2px solid var(--accent)';
        units.forEach((o, i) => {
          if (i !== idx) o.style.outline = '';
        });
      }
      if (e.key === 'Enter') location.href = u.querySelector('.unit-name').href;
      if (e.key === 'c') {
        const cb = u.querySelector('[data-compare]');
        if (cb) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  }

  /* compare set, kept per browser */
  const KEY = 'compare';
  const getSet = () => new Set((store.get(KEY) ?? '').split(',').filter(Boolean));
  const bar = $('[data-compare-bar]');
  function paint() {
    const set = getSet();
    $$('[data-compare]').forEach((cb) => {
      cb.checked = set.has(cb.dataset.compare);
    });
    if (bar) {
      bar.hidden = set.size === 0;
      $('[data-compare-count]', bar).textContent = `${set.size} selected`;
      $('[data-compare-link]', bar).href = `/compare?ids=${[...set].join(',')}`;
    }
    const nav = $('.bottomnav a[href="/compare"], .nav a[href="/compare"]');
    if (nav) nav.href = set.size ? `/compare?ids=${[...set].join(',')}` : '/compare';
    $$('a[href="/compare"]').forEach((a) => {
      if (set.size) a.href = `/compare?ids=${[...set].join(',')}`;
    });
  }
  document.addEventListener('change', (e) => {
    const cb = e.target.closest?.('[data-compare]');
    if (!cb) return;
    const set = getSet();
    cb.checked ? set.add(cb.dataset.compare) : set.delete(cb.dataset.compare);
    if (set.size > 20) {
      set.delete(cb.dataset.compare);
      cb.checked = false;
    }
    store.set(KEY, [...set].join(','));
    paint();
  });
  $('[data-compare-clear]')?.addEventListener('click', () => {
    store.set(KEY, '');
    paint();
  });
  paint();

  /* tabs, copy, confirms, autosubmit, filter sheet */
  for (const tabs of $$('[data-tabs]')) {
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      $$('[data-tab]', tabs).forEach((x) =>
        x.setAttribute('aria-selected', x === b ? 'true' : 'false'),
      );
      $$('[data-panel]', tabs).forEach((p) => {
        p.hidden = p.dataset.panel !== b.dataset.tab;
      });
    });
  }
  document.addEventListener('click', async (e) => {
    const c = e.target.closest?.('[data-copy]');
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c.dataset.copy);
      const t = c.textContent;
      c.textContent = 'Copied';
      setTimeout(() => {
        c.textContent = t;
      }, 1200);
    } catch {}
  });
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset.confirm && !confirm(f.dataset.confirm)) e.preventDefault();
  });
  for (const f of $$('[data-autosubmit]'))
    f.addEventListener('change', (e) => {
      if (e.target.tagName === 'SELECT') f.requestSubmit();
    });
  const facets = $('#facets');
  $$('[data-open-facets]').forEach((b) =>
    b.addEventListener('click', () => {
      facets?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }),
  );
  $$('[data-close-facets]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      facets?.classList.remove('open');
      document.body.style.overflow = '';
    }),
  );

  /* passkeys */
  const say = (el, msg, kind) => {
    if (el) {
      el.textContent = msg;
      el.dataset.kind = kind;
    }
  };
  const postJson = (url, body) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  const wa = () => window.SimpleWebAuthnBrowser;
  const signin = $('#passkey-signin');
  signin?.addEventListener('click', async () => {
    const msg = $('#passkey-signin-msg');
    if (!wa()) return say(msg, 'Passkeys are not available in this browser.', 'error');
    try {
      const options = await (await postJson('/api/auth/passkey/authenticate/options')).json();
      const resp = await wa().startAuthentication({ optionsJSON: options });
      const res = await postJson('/api/auth/passkey/authenticate/verify', resp);
      if (res.ok) {
        location.href = new URLSearchParams(location.search).get('next') || '/settings';
        return;
      }
      say(msg, (await res.json()).error ?? 'That passkey was not recognised.', 'error');
    } catch (err) {
      say(
        msg,
        err?.name === 'NotAllowedError'
          ? 'Cancelled.'
          : `Could not sign in: ${err?.message ?? err}`,
        'error',
      );
    }
  });
  const add = $('#add-passkey');
  add?.addEventListener('click', async () => {
    const msg = $('#add-passkey-msg');
    if (!wa()) return say(msg, 'Passkeys are not available in this browser.', 'error');
    try {
      const options = await (await postJson('/api/auth/passkey/register/options')).json();
      const att = await wa().startRegistration({ optionsJSON: options });
      const res = await postJson('/api/auth/passkey/register/verify', att);
      if (res.ok) {
        location.reload();
        return;
      }
      say(msg, (await res.json()).error ?? 'The server rejected that passkey.', 'error');
    } catch (err) {
      say(
        msg,
        err?.name === 'InvalidStateError'
          ? 'This device already has a passkey here.'
          : `Could not add a passkey: ${err?.message ?? err}`,
        'error',
      );
    }
  });

  /* pwa */
  if ('serviceWorker' in navigator && location.protocol === 'https:')
    navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
