#!/usr/bin/env node
/**
 * Derives the Make interface (output structure) of every module from the response
 * schemas of the Searcherries OpenAPI document (reference/openapi-v1.yaml) and writes
 * src/modules/<module>/<module>.interface.iml.jsonc.
 *
 *   node scripts/generate-interfaces.mjs          # (re)write the files
 *   node scripts/generate-interfaces.mjs --check  # exit 1 when a file is out of date
 *
 * Mapping (Make interface syntax, see developers.make.com → Component blocks → Interface):
 *   object with properties → collection + spec, object without → collection + empty spec,
 *   array of objects → array + spec, array of primitives → array + spec {type},
 *   array of unknown objects → array (no spec), string(date-time) → date, string(uri) → url,
 *   string(date) → text (Make: dates without time stay text), integer → integer,
 *   number → number, boolean → boolean, anything else → any.
 *   oneOf/anyOf/allOf → the union of the object members (null members dropped).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = yaml.load(readFileSync(join(root, 'reference/openapi-v1.yaml'), 'utf8'));
const schemas = spec.components.schemas;
const check = process.argv.includes('--check');

/** Extra fields the spec only describes in prose (history rows of GET /competitors). */
const COMPETITOR_HISTORY_ROW = {
    type: 'object',
    properties: {
        period_start: { type: 'string', format: 'date' },
        period_end: { type: 'string', format: 'date' },
        own_brand: { type: ['object', 'null'], additionalProperties: true },
        tracked_competitors: { type: 'integer' },
        top_competitors: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
};

/** Module directory → how to build its interface. */
const MODULES = {
    'list-projects': { schema: 'ProjectListItem' },
    'get-project-summary': { schema: 'ProjectSummary' },
    'get-action-plan': { schema: 'ActionPlan' },
    'list-answers': { schema: 'AnswerRow' },
    'list-competitors': { union: [{ $ref: '#/components/schemas/CompetitorRow' }, COMPETITOR_HISTORY_ROW] },
    'get-competitor': {
        schema: 'CompetitorsResponse',
        pick: ['project', 'dataset', 'period', 'found', 'competitor', 'reason'],
        override: { competitor: { $ref: '#/components/schemas/CompetitorRow' } },
    },
    'list-citations': { union: [{ $ref: '#/components/schemas/CitationUrlRow' }, { $ref: '#/components/schemas/CitationDomainRow' }] },
    'get-search-performance': { schema: 'SearchPerformanceResponse' },
    'get-ai-traffic': { schema: 'AiTrafficResponse' },
};

const ACRONYMS = { id: 'ID', ids: 'IDs', url: 'URL', urls: 'URLs', ga4: 'GA4', ctr: 'CTR', ai: 'AI', api: 'API', seo: 'SEO', kpi: 'KPI', kpis: 'KPIs' };

function label(name) {
    const words = name.split('_').filter(Boolean).map((w) => ACRONYMS[w] ?? w);
    const [first, ...rest] = words;
    const head = ACRONYMS[first.toLowerCase()] ? first : first.charAt(0).toUpperCase() + first.slice(1);
    return [head, ...rest].join(' ');
}

function singular(name) {
    return name.endsWith('ies') ? `${name.slice(0, -3)}y` : name.endsWith('s') ? name.slice(0, -1) : name;
}

function deref(node) {
    if (node && node.$ref) {
        const name = node.$ref.replace('#/components/schemas/', '');
        if (!schemas[name]) throw new Error(`Unknown schema ${node.$ref}`);
        return deref(schemas[name]);
    }
    return node;
}

function isNull(node) {
    return node && (node.type === 'null' || (Array.isArray(node.type) && node.type.length === 1 && node.type[0] === 'null'));
}

/** Collapses allOf/oneOf/anyOf into one plain schema (object members are merged). */
function resolve(node) {
    node = deref(node);
    if (!node) return { type: 'any' };
    const combos = ['allOf', 'oneOf', 'anyOf'].filter((k) => Array.isArray(node[k]));
    if (combos.length === 0) return node;
    const members = combos.flatMap((k) => node[k]).map(resolve).filter((m) => !isNull(m));
    const objects = members.filter((m) => baseType(m) === 'object');
    if (objects.length > 0) {
        const merged = { type: 'object', properties: {} };
        for (const m of objects) {
            Object.assign(merged.properties, m.properties ?? {});
            if (m.additionalProperties) merged.additionalProperties = m.additionalProperties;
        }
        return merged;
    }
    return members[0] ?? { type: 'any' };
}

function baseType(node) {
    if (!node) return 'any';
    if (Array.isArray(node.type)) return node.type.find((t) => t !== 'null') ?? 'any';
    if (node.type) return node.type;
    if (node.properties || node.additionalProperties) return 'object';
    if (node.items) return 'array';
    if (node.const !== undefined) return typeof node.const === 'boolean' ? 'boolean' : typeof node.const === 'number' ? 'number' : 'string';
    return 'any';
}

function toParam(name, node, withName = true) {
    const schema = resolve(node);
    const type = baseType(schema);
    const param = withName ? { name, label: label(name) } : { label: label(singular(name)) };
    switch (type) {
        case 'object': {
            param.type = 'collection';
            param.spec = schema.properties ? Object.entries(schema.properties).map(([k, v]) => toParam(k, v)) : [];
            if (param.spec.length === 0 && schema.additionalProperties === undefined) param.spec = [];
            break;
        }
        case 'array': {
            param.type = 'array';
            const items = resolve(schema.items ?? {});
            const itemType = baseType(items);
            if (itemType === 'object') {
                if (items.properties) param.spec = Object.entries(items.properties).map(([k, v]) => toParam(k, v));
                // unknown object structure: Make wants no spec on arrays
            } else if (itemType !== 'any') {
                const inner = toParam(name, items, false);
                param.spec = { type: inner.type, label: inner.label };
            }
            break;
        }
        case 'string':
            param.type = schema.format === 'date-time' ? 'date' : schema.format === 'uri' ? 'url' : 'text';
            break;
        case 'integer':
            param.type = 'integer';
            break;
        case 'number':
            param.type = 'number';
            break;
        case 'boolean':
            param.type = 'boolean';
            break;
        default:
            param.type = 'any';
    }
    // Make lists name, type, label in that order; keep files readable.
    const ordered = withName ? { name: param.name, type: param.type, label: param.label } : { type: param.type, label: param.label };
    if (param.spec !== undefined) ordered.spec = param.spec;
    return ordered;
}

function buildInterface(config) {
    let schema;
    if (config.union) {
        schema = resolve({ anyOf: config.union });
    } else {
        schema = resolve({ $ref: `#/components/schemas/${config.schema}` });
    }
    let entries = Object.entries(schema.properties ?? {});
    if (config.pick) entries = config.pick.map((k) => [k, schema.properties[k]]);
    if (config.override) entries = entries.map(([k, v]) => [k, config.override[k] ?? v]);
    return entries.map(([k, v]) => toParam(k, v));
}

let outdated = 0;
for (const [dir, config] of Object.entries(MODULES)) {
    const file = join(root, 'src/modules', dir, `${dir}.interface.iml.jsonc`);
    const content = `${JSON.stringify(buildInterface(config), null, 4)}\n`;
    if (check) {
        const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
        if (current !== content) {
            outdated++;
            console.error(`OUT OF DATE: ${file} (run npm run generate:interfaces)`);
        }
    } else {
        writeFileSync(file, content);
        console.log(`wrote ${file}`);
    }
}
if (check) {
    console.log(outdated === 0 ? 'Interfaces are up to date with reference/openapi-v1.yaml.' : `${outdated} interface file(s) out of date.`);
    process.exit(outdated === 0 ? 0 : 1);
}
