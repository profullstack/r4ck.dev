import { countriesFor, PLACE_WORDS } from './countries.js';
import { KINDS } from './facets.js';

/**
 * "2 vcpu 8gb ram 100gb nvme under $10 in germany from hetzner" → filters.
 *
 * A small grammar, not a model: numbers with units, price words, place
 * names, kinds, and a few adjectives. What it does not understand stays as
 * `q` and goes to full-text search, and `understood` lists every token it
 * did claim so the page can show its reading and the caller can correct it.
 */
const KIND_WORDS = {
  vps: 'vps',
  vpss: 'vps',
  vds: 'vps',
  kvm: 'vps',
  'virtual server': 'vps',
  'virtual private server': 'vps',
  cloud: 'cloud',
  'cloud server': 'cloud',
  instance: 'cloud',
  instances: 'cloud',
  dedicated: 'dedicated',
  dedi: 'dedicated',
  'dedicated server': 'dedicated',
  'bare metal': 'bare-metal',
  'bare-metal': 'bare-metal',
  baremetal: 'bare-metal',
  metal: 'bare-metal',
  shared: 'shared',
  'shared hosting': 'shared',
  'web hosting': 'shared',
  cpanel: 'shared',
  managed: 'managed',
  paas: 'paas',
  platform: 'paas',
  serverless: 'serverless',
  functions: 'serverless',
  storage: 'storage',
  'object storage': 'storage',
  s3: 'storage',
  backup: 'storage',
  colo: 'colocation',
  colocation: 'colocation',
  edge: 'edge',
  gpu: 'gpu',
  gpus: 'gpu',
};
const KIND_PHRASES = Object.keys(KIND_WORDS).sort((a, b) => b.length - a.length);

const GPU_MODELS =
  /\b(h100|h200|a100|a10g?|a6000|a40|l40s?|l4|t4|v100|rtx\s?\d{4}\w*|\d{4}\s?ti|b200|gh200|mi300x?|4090|3090|5090)\b/i;
const ARCH = /\b(arm64|aarch64|arm|x86_64|x86|amd64|x64|epyc|xeon|ryzen|graviton|apple silicon)\b/i;

export function parseQuery(text) {
  let s = ` ${String(text ?? '')
    .toLowerCase()
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')} `;
  const f = {};
  const understood = [];
  const take = (re, fn) => {
    s = s.replace(re, (...m) => {
      const r = fn(...m);
      if (r !== false) understood.push(m[0].trim());
      return r === false ? m[0] : ' ';
    });
  };

  // Money. "under $10", "< 10 usd", "max $10/mo", "$5-$10", "10 dollars a month".
  const money = String.raw`\$?\s?(\d+(?:\.\d+)?)\s?(?:usd|dollars?|bucks|\$|eur|€|gbp|£)?(?:\s?(?:/|per|a|an)\s?(?:mo|month|monthly|m))?`;
  take(
    new RegExp(String.raw`\s(?:between|from)\s${money}\s(?:and|to|-)\s${money}\s`, 'g'),
    (_, lo, hi) => {
      f.min_price = Number(lo);
      f.max_price = Number(hi);
    },
  );
  take(
    /\s\$(\d+(?:\.\d+)?)\s?-\s?\$?(\d+(?:\.\d+)?)(?:\s?(?:\/|per|a)\s?(?:mo|month))?\s/g,
    (_, lo, hi) => {
      f.min_price = Number(lo);
      f.max_price = Number(hi);
    },
  );
  take(
    new RegExp(
      String.raw`\s(?:under|below|<=?|max(?:imum)?|up to|at most|less than|cheaper than|budget(?: of)?)\s?${money}\s`,
      'g',
    ),
    (_, n) => {
      f.max_price = Number(n);
    },
  );
  take(/\s(?:over|above|>=?|min(?:imum)?|at least|more than)\s?\$\s?(\d+(?:\.\d+)?)\s/g, (_, n) => {
    f.min_price = Number(n);
  });
  take(/\s\$\s?(\d+(?:\.\d+)?)(?:\s?(?:\/|per|a|an)\s?(?:mo|month|monthly|m))?\s/g, (_, n) => {
    f.max_price = Number(n);
  });
  take(
    /\s(\d+(?:\.\d+)?)\s?(?:usd|dollars?|bucks|eur|€|gbp|£)(?:\s?(?:\/|per|a|an)\s?(?:mo|month|monthly|m))?\s/g,
    (_, n) => {
      f.max_price = Number(n);
    },
  );

  // Compute. "2 vcpu", "4 cores", "8-core", "2c".
  take(
    /\s(?:at least|min(?:imum)?|>=?)?\s?(\d+)\s?[-x]?\s?(?:v?cpus?|v?cores?|threads?|c(?=\s))\s?(?:\+|or more|and up)?\s/g,
    (_, n) => {
      f.min_vcpu = Number(n);
    },
  );
  take(/\s(?:up to|max(?:imum)?|<=?)\s?(\d+)\s?[-x]?\s?(?:v?cpus?|v?cores?)\s/g, (_, n) => {
    f.max_vcpu = Number(n);
  });

  // Memory and disk: a size with a unit, disambiguated by what follows it.
  const size = String.raw`(\d+(?:\.\d+)?)\s?(gb|g|gib|tb|t|tib|mb|m)`;
  const gb = (n, u) =>
    u.startsWith('t') ? Number(n) * 1000 : u.startsWith('m') ? Number(n) / 1024 : Number(n);
  take(
    new RegExp(
      String.raw`\s(?:at least|min(?:imum)?|>=?)?\s?${size}\s?(?:of\s)?(?:ram|memory|mem)\s?(?:\+|or more)?\s`,
      'g',
    ),
    (_, n, u) => {
      f.min_ram = gb(n, u);
    },
  );
  take(
    new RegExp(
      String.raw`\s(?:up to|max(?:imum)?|<=?)\s?${size}\s?(?:of\s)?(?:ram|memory|mem)\s`,
      'g',
    ),
    (_, n, u) => {
      f.max_ram = gb(n, u);
    },
  );
  take(
    new RegExp(
      String.raw`\s(?:at least|min(?:imum)?|>=?)?\s?${size}\s?(?:of\s)?(nvme|ssd|hdd|disk|storage|space|drive)\s?(?:\+|or more)?\s`,
      'g',
    ),
    (_, n, u, word) => {
      // "32gb nvme" in a spec sentence is 32 GB of RAM on an NVMe box, not a 32 GB
      // disk: a size under 100 GB before a disk TYPE word is memory when no memory
      // was named. "100gb nvme" and "40gb disk" are disks.
      const v = gb(n, u);
      if (
        ['nvme', 'ssd'].includes(word) &&
        v < 100 &&
        f.min_ram === undefined &&
        !u.startsWith('t')
      ) {
        f.min_ram = v;
        return;
      }
      f.min_disk = v;
    },
  );
  take(
    new RegExp(
      String.raw`\s(?:up to|max(?:imum)?|<=?)\s?${size}\s?(?:of\s)?(?:nvme|ssd|hdd|disk|storage)\s`,
      'g',
    ),
    (_, n, u) => {
      f.max_disk = gb(n, u);
    },
  );
  // A bare size is memory: "2 vcpu 4gb" is how people say it. A terabyte, or
  // anything from 100 GB up, is a disk: nobody types "1tb" meaning RAM.
  take(new RegExp(String.raw`\s${size}\s`, 'g'), (_, n, u) => {
    const v = gb(n, u);
    if (u.startsWith('t') || v >= 100) {
      if (f.min_disk !== undefined) return false;
      f.min_disk = v;
      return;
    }
    if (f.min_ram !== undefined) return false;
    f.min_ram = v;
  });

  // GPU.
  take(GPU_MODELS, (m) => {
    f.gpu = true;
    f.gpu_model = m.trim();
  });
  take(/\s(?:with(?:out)?\s)?(?:a\s)?(nvidia|gpu|gpus|graphics card|accelerator)\s/g, (m, _w) => {
    f.gpu = !/without/.test(m);
  });
  take(/\sno\s(?:gpu|gpus)\s/g, () => {
    f.gpu = false;
  });

  take(ARCH, (m) => {
    const a = m.trim();
    f.arch = /arm|aarch|graviton|apple/.test(a) ? 'arm64' : 'x86_64';
  });

  // Provider automation: "with a cli", "has api", "terraform".
  take(
    /\s(?:with|has|having|supports?|offers?)\s(?:an?\s)?(cli|api|terraform|mcp)(?:\s(?:and|\+|&)\s(?:an?\s)?(cli|api|terraform|mcp))?\s/g,
    (_, a, b) => {
      f.has = [...new Set([...(f.has ?? []), a, b].filter(Boolean))];
    },
  );
  take(/\s(terraform)\s/g, (_, a) => {
    f.has = [...new Set([...(f.has ?? []), a])];
  });

  // Billing term and sort words.
  take(/\s(hourly|per hour|by the hour)\s/g, () => {
    f.interval = 'hour';
  });
  take(/\s(yearly|annual|annually|per year)\s/g, () => {
    f.interval = 'year';
  });
  take(/\s(cheapest|cheap|lowest price|budget)\s/g, () => {
    f.sort = 'price';
  });
  take(/\s(best value|value)\s/g, () => {
    f.sort = 'value';
  });
  take(/\s(most ram|biggest|largest|most memory)\s/g, () => {
    f.sort = 'ram';
    f.order = 'desc';
  });
  take(/\s(in stock|available)\s/g, () => {
    f.stock = 'in_stock';
  });
  take(/\s(dedicated (?:cpu|cores?)|dedicated tenancy)\s/g, () => {
    f.tenancy = 'dedicated';
  });

  // Provider: "from vultr", "at hetzner", "by ovh", "provider:vultr".
  take(/\sprovider:([a-z0-9.-]+)\s/g, (_, p) => {
    f.provider = [...(f.provider ?? []), p];
  });
  take(/\s(?:from|at|by|on)\s([a-z0-9][a-z0-9.-]{1,40})\s/g, (_m, p) => {
    if (countriesFor(p) || KIND_WORDS[p] || ['least', 'most', 'the', 'a', 'an'].includes(p))
      return false;
    f.provider = [...(f.provider ?? []), p];
  });

  // Places: "in germany", "eu", "us east".
  for (const place of PLACE_WORDS) {
    const re = new RegExp(
      String.raw`\s(?:in|near|located in|hosted in|from)?\s?${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s`,
      'g',
    );
    if (
      place.length <= 2 &&
      !/^(eu|us|uk|de|nl|fr|ca|au|sg|jp|in|hk|ch|se|no|fi|pl|ie|it|es|pt|br|mx|za|ae|il|tr|kr|tw|my|id|th|vn|ph|cz|at|be|dk|bg|ro|hu|gr|nz|ru|ua|lu|ee|lv|lt|cy|mt|ng|ke|eg|ma|sa|qa|bh|pk|bd|lk|kz|ge|am|ar|cl|co|pe|uy|cr|pa|md|rs|hr|si|sk|is)$/.test(
        place,
      )
    )
      continue;
    if (place === 'in') continue;
    take(re, () => {
      const codes = countriesFor(place);
      if (!codes) return false;
      f.country = [...new Set([...(f.country ?? []), ...codes])];
      if (codes.length > 1) f.region = place;
    });
  }

  // Kinds, longest phrase first.
  for (const phrase of KIND_PHRASES) {
    const re = new RegExp(
      String.raw`\s${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:es|s)?\s`,
      'g',
    );
    take(re, () => {
      const k = KIND_WORDS[phrase];
      if (k === 'gpu') {
        f.gpu = true;
        return;
      }
      if (!KINDS.includes(k)) return false;
      f.kind = [...new Set([...(f.kind ?? []), k])];
    });
  }

  const rest = s
    .replace(
      /\b(a|an|the|with|and|or|for|server|servers|hosting|host|plan|plans|please|me|find|show|get|want|need|i|some|cheap|good|best|under|over|in|of|per|mo|month|monthly)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (rest) f.q = rest;
  return { filters: f, understood, rest };
}
