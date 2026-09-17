import { config } from '@r4ck/config';
import { llmsTxt, skillMd } from '../llms.js';
import {
  checkHeaders,
  ERRORS,
  era,
  fail,
  META_SERVER_INFO,
  modernVersion,
  negotiate,
  ok,
  rpcError,
  SUPPORTED_VERSIONS,
  unsupportedVersion,
} from './protocol.js';
import { describe, runTool, TOOLS, TOOLS_BY_NAME } from './tools.js';

/** One JSON-RPC message in, one answer out. Stateless, so both protocol eras share the endpoint. */
export const SERVER_INFO = { name: 'r4ck', title: config.siteName, version: '1.0.0' };
export const CAPABILITIES = { tools: {}, resources: {}, prompts: {} };

export const INSTRUCTIONS = [
  `${config.siteName} is a search engine over every server offer for sale: VPS, cloud instances,`,
  'bare metal, GPU nodes, PaaS and shared plans, with the provider behind each one.',
  '',
  'Start with `search_servers` and a sentence ("2 vcpu 4gb under $10 in germany") or explicit',
  'parameters. Read `understood` to see how the sentence was parsed and `facets` to see what',
  'narrowing remains; every count is the number of rows left if that value is chosen next.',
  '`cheapest` ranks the rows meeting a spec by price; `compare_servers` lays chosen ids side by side;',
  '`get_server` has the price history and similar offers. `list_providers` with has=["api","cli"]',
  'keeps to providers a machine can drive. Quote `price.monthly_usd` as an estimate and',
  '`price.amount` + currency + interval as the fact. Anyone may read; a key (Authorization:',
  'Bearer r4k_…) is needed only to save searches.',
].join('\n');

function resources() {
  return [
    {
      uri: `${config.siteUrl}/llms.txt`,
      name: 'llms.txt',
      title: 'The site, described for language models',
      mimeType: 'text/plain',
    },
    {
      uri: `${config.siteUrl}/skill.md`,
      name: 'skill.md',
      title: 'How to use r4ck well',
      mimeType: 'text/markdown',
    },
  ];
}

const PROMPTS = [
  {
    name: 'find_server',
    title: 'Find the right server',
    description: 'Turn a need into a shortlist of three offers with a recommendation.',
    arguments: [
      { name: 'need', description: 'What the machine is for, in plain words', required: true },
    ],
  },
];

export async function handle(message, ctx) {
  if (!message || typeof message !== 'object' || Array.isArray(message))
    return { status: 400, body: fail(null, ERRORS.INVALID_REQUEST, 'Expected a JSON-RPC object') };
  const id = message.id ?? null;
  const method = String(message.method ?? '');
  const isNotification = !('id' in message);
  if (!method) return { status: 400, body: fail(id, ERRORS.INVALID_REQUEST, 'Missing method') };
  const modern = era(message) === 'modern';
  if (modern) {
    const bad = checkHeaders(message, ctx.header);
    if (bad) return { status: 400, body: fail(id, bad.code, bad.message) };
    const version = modernVersion(message);
    if ('unsupported' in version)
      return { status: 400, body: unsupportedVersion(id, version.unsupported) };
  }
  if (isNotification) return { status: 202, body: null };
  try {
    const result = await dispatch(method, message.params ?? {}, ctx);
    if (result === UNKNOWN)
      return {
        status: modern ? 404 : 200,
        body: fail(id, ERRORS.METHOD_NOT_FOUND, `Method not found: ${method}`),
      };
    return { status: 200, body: ok(id, result) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (err && typeof err === 'object' && 'rpcCode' in err)
      return { status: 200, body: fail(id, Number(err.rpcCode), detail) };
    console.error('[mcp]', err);
    return { status: 200, body: fail(id, ERRORS.INTERNAL, `Internal error: ${detail}`) };
  }
}

const UNKNOWN = Symbol('unknown');

async function dispatch(method, params, ctx) {
  switch (method) {
    case 'server/discover':
      return {
        resultType: 'complete',
        supportedVersions: SUPPORTED_VERSIONS,
        capabilities: CAPABILITIES,
        instructions: INSTRUCTIONS,
        ttlMs: 3_600_000,
        cacheScope: 'public',
        _meta: { [META_SERVER_INFO]: SERVER_INFO },
      };
    case 'initialize':
      return {
        protocolVersion: negotiate(params?.protocolVersion),
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS.map(describe) };
    case 'tools/call':
      return callTool(params, ctx);
    case 'resources/list':
      return { resources: resources() };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    case 'resources/read':
      return readResource(params);
    case 'prompts/list':
      return { prompts: PROMPTS };
    case 'prompts/get':
      return getPrompt(params);
    default:
      return UNKNOWN;
  }
}

async function callTool(params, ctx) {
  const name = String(params?.name ?? '');
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool)
    return text(`No such tool: ${name}. Call tools/list for what this server offers.`, true);
  try {
    const result = await runTool(tool, params?.arguments ?? {}, ctx);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
      isError: false,
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'toolError' in err)
      return text(String(err.message), true);
    throw err;
  }
}

async function readResource(params) {
  const uri = String(params?.uri ?? '');
  const r = resources().find((x) => x.uri === uri);
  if (!r) throw rpcError(ERRORS.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`);
  return {
    contents: [
      {
        uri: r.uri,
        mimeType: r.mimeType,
        text: r.name === 'skill.md' ? await skillMd() : await llmsTxt(),
      },
    ],
  };
}

function getPrompt(params) {
  const p = PROMPTS.find((x) => x.name === String(params?.name ?? ''));
  if (!p) throw rpcError(ERRORS.INVALID_PARAMS, `No such prompt: ${params?.name}`);
  const need = String(params?.arguments?.need ?? 'a small web server');
  return {
    description: p.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I need a server for: ${need}.\n\nUse search_servers with a sentence first, read "understood" and correct it with explicit parameters if needed, narrow with the facets until under 20 rows remain, then compare_servers on the best three. Prefer providers with has=["api","cli"] when the machine will be provisioned by a script. Recommend one, say why in two sentences, quote monthly_usd as an estimate and the billed price as the fact, and link the page.`,
        },
      },
    ],
  };
}

const text = (body, isError = false) => ({ content: [{ type: 'text', text: body }], isError });
