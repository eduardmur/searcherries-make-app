#!/usr/bin/env node
/**
 * Validates the Make app in src/ the way the Make Apps Editor for VS Code does
 * (JSON schemas copied from the extension, see scripts/schemas/NOTICE.md) plus the
 * cross-file checks the editor leaves to Make's server:
 *
 *   - makecomapp.json against makecomapp.schema.json; every code file it names exists
 *     and no code file lies around unreferenced; component IDs follow Make's rules
 *   - every code file parses as JSON with comments and validates against the schema
 *     the extension maps to its file name (base, api, parameters, samples, groups, common)
 *   - references: module/RPC → connection, rpc:// → RPC, groups.json ↔ modules,
 *     {{parameters.x}} ↔ declared parameters, {{connection.x}} ↔ connection parameters
 *   - Make conventions: search modules iterate, carry response.limit and a `limit`
 *     parameter; action modules return one bundle; the universal module keeps the
 *     documented label; base and connection sanitize the authorization header
 *   - IML sanity: balanced {{ }} in every string
 *   - samples: one object whose keys all exist in the interface
 *   - logo: PNG, square, 512 to 2048 px, at most 500 kB (Make's app logo rules)
 *
 * Exit code 1 when any error was found.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse as parseJsonc } from 'jsonc-parser';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = process.env.MAKE_APP_DIR ? resolve(process.env.MAKE_APP_DIR) : join(root, 'src');
const schemaDir = join(root, 'scripts/schemas');

const errors = [];
const warnings = [];
const error = (file, message) => errors.push(`${file}: ${message}`);
const warn = (file, message) => warnings.push(`${file}: ${message}`);
const rel = (file) => relative(root, file);

// ---------------------------------------------------------------- schemas
const ajv = new Ajv({ strict: false, allErrors: true, allowUnionTypes: true, unicodeRegExp: false });
addFormats(ajv);
for (const keyword of ['doNotSuggest', 'errorMessage']) ajv.addKeyword(keyword);
for (const name of ['sources', 'enums', 'response', 'api', 'base', 'parameters', 'samples', 'groups', 'common']) {
    const schema = JSON.parse(readFileSync(join(schemaDir, `${name}.json`), 'utf8'));
    stripAnchors(schema);
    ajv.addSchema(schema, `${name}.json`);
}
const makecomappSchema = JSON.parse(readFileSync(join(schemaDir, 'makecomapp.schema.json'), 'utf8'));
const validateMakecomapp = ajv.compile(makecomappSchema);

/** The extension's schemas use `$id: "#name"` anchors that ajv 8 rejects; references are path-based anyway. */
function stripAnchors(node) {
    if (Array.isArray(node)) return node.forEach(stripAnchors);
    if (node && typeof node === 'object') {
        if (typeof node.$id === 'string' && node.$id.startsWith('#')) delete node.$id;
        Object.values(node).forEach(stripAnchors);
    }
}

function validateAgainst(schemaName, data, file) {
    const validate = ajv.getSchema(`${schemaName}.json`);
    if (!validate(data)) {
        for (const e of validate.errors ?? []) error(file, `schema ${schemaName}: ${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
    }
}

function readJsonc(file) {
    const problems = [];
    const data = parseJsonc(readFileSync(file, 'utf8'), problems, { allowTrailingComma: false });
    if (problems.length > 0) error(rel(file), `invalid JSON(C): ${problems.map((p) => `error ${p.error} at offset ${p.offset}`).join(', ')}`);
    return data;
}

/** The schema the extension's package.json maps to each code type (contributes.jsonValidation). */
const SCHEMA_BY_CODE_TYPE = {
    base: 'base',
    common: 'common',
    groups: 'groups',
    communication: 'api',
    params: 'parameters',
    staticParams: 'parameters',
    mappableParams: 'parameters',
    interface: 'parameters',
    samples: 'samples',
};

const ID_RULES = {
    // src/local-development/helpers/validate-id.ts of the extension
    module: /^[a-zA-Z][0-9a-zA-Z]{2,63}$/,
    rpc: /^[a-zA-Z][0-9a-zA-Z]{2,63}$/,
    function: /^[a-zA-Z][0-9a-zA-Z]{1,94}[0-9a-zA-Z]$/,
    webhook: /^[a-zA-Z][0-9a-zA-Z-]{1,33}[0-9a-zA-Z]$/,
    connection: /^[a-zA-Z][0-9a-zA-Z-]{1,33}[0-9a-zA-Z]$/,
    endpoint: /^[a-zA-Z][0-9a-zA-Z]{1,126}[0-9a-zA-Z]$/,
};
const RESERVED_WORDS = new Set(['abstract', 'arguments', 'await', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'double', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'final', 'finally', 'float', 'for', 'function', 'goto', 'if', 'implements', 'import', 'in', 'instanceof', 'int', 'interface', 'let', 'long', 'native', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'true', 'try', 'typeof', 'var', 'void', 'volatile', 'while', 'with', 'yield']);

// ---------------------------------------------------------------- manifest
const manifestFile = join(appDir, 'makecomapp.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
if (!validateMakecomapp(manifest)) {
    for (const e of validateMakecomapp.errors ?? []) error('src/makecomapp.json', `${e.instancePath || '/'} ${e.message}`);
}
for (const origin of manifest.origins ?? []) {
    if (!/^https:\/\/[a-z0-9.-]+\/api$/.test(origin.baseUrl)) error('src/makecomapp.json', `origin "${origin.label}": baseUrl must look like https://<zone>.make.com/api`);
    if (!/^[a-z][0-9a-z-]{1,28}[0-9a-z]$/.test(origin.appId)) error('src/makecomapp.json', `origin "${origin.label}": appId "${origin.appId}" does not match Make's app name rule`);
}

const referencedFiles = new Set();
const loaded = {}; // relative path → parsed content

function loadCode(codeType, relPath, owner) {
    const file = join(appDir, relPath);
    referencedFiles.add(resolve(file));
    if (!existsSync(file)) {
        error('src/makecomapp.json', `${owner}: code file "${relPath}" does not exist`);
        return undefined;
    }
    const data = codeType === 'readme' ? readFileSync(file, 'utf8') : readJsonc(file);
    if (codeType !== 'readme' && data !== undefined) {
        const schema = SCHEMA_BY_CODE_TYPE[codeType];
        if (schema) validateAgainst(schema, data, rel(file));
        checkImlBraces(data, rel(file));
    }
    loaded[relPath] = data;
    return data;
}

for (const [codeType, relPath] of Object.entries(manifest.generalCodeFiles)) {
    if (relPath === null) continue;
    loadCode(codeType, relPath, `general ${codeType}`);
}

const components = {};
for (const [componentType, items] of Object.entries(manifest.components)) {
    components[componentType] = {};
    for (const [id, meta] of Object.entries(items)) {
        if (!ID_RULES[componentType].test(id)) error('src/makecomapp.json', `${componentType} ID "${id}" breaks Make's ID rule ${ID_RULES[componentType]}`);
        if (RESERVED_WORDS.has(id)) error('src/makecomapp.json', `${componentType} ID "${id}" is a JavaScript reserved word`);
        if (meta === null) {
            warn('src/makecomapp.json', `${componentType} "${id}" is reserved but not implemented (null)`);
            continue;
        }
        const codes = {};
        for (const [codeType, relPath] of Object.entries(meta.codeFiles ?? {})) {
            if (relPath === null) continue;
            codes[codeType] = loadCode(codeType, relPath, `${componentType} ${id}`);
            const expectedDir = `${componentType}s/`;
            if (!relPath.startsWith(expectedDir)) warn('src/makecomapp.json', `${componentType} "${id}": "${relPath}" is outside the "${expectedDir}" folder the editor uses`);
        }
        components[componentType][id] = { meta, codes };
        if (['module', 'rpc'].includes(componentType)) {
            if (typeof meta.connection === 'string' && !manifest.components.connection[meta.connection]) error('src/makecomapp.json', `${componentType} "${id}" references unknown connection "${meta.connection}"`);
            if (typeof meta.altConnection === 'string' && !manifest.components.connection[meta.altConnection]) error('src/makecomapp.json', `${componentType} "${id}" references unknown altConnection "${meta.altConnection}"`);
        }
        if (componentType === 'module') {
            if (!meta.moduleType) error('src/makecomapp.json', `module "${id}" has no moduleType`);
            if (!meta.label) error('src/makecomapp.json', `module "${id}" has no label`);
            if (!meta.description) error('src/makecomapp.json', `module "${id}" has no description`);
            if (meta.moduleType === 'action' && !meta.actionCrud) warn('src/makecomapp.json', `action module "${id}" has no actionCrud (create/read/update/delete)`);
            for (const codeType of ['communication', 'staticParams', 'mappableParams', 'interface', 'samples']) if (!meta.codeFiles?.[codeType]) error('src/makecomapp.json', `module "${id}" has no ${codeType} code file`);
        }
        if (componentType === 'connection') {
            if (!meta.connectionType) error('src/makecomapp.json', `connection "${id}" has no connectionType`);
            for (const codeType of ['communication', 'params']) if (!meta.codeFiles?.[codeType]) error('src/makecomapp.json', `connection "${id}" has no ${codeType} code file`);
        }
        if (componentType === 'rpc') {
            for (const codeType of ['communication', 'params']) if (!meta.codeFiles?.[codeType]) error('src/makecomapp.json', `rpc "${id}" has no ${codeType} code file`);
        }
    }
}

// Unreferenced files inside src/ (besides the manifest itself)
for (const file of walk(appDir)) {
    if (resolve(file) === resolve(manifestFile)) continue;
    if (!referencedFiles.has(resolve(file))) warn(rel(file), 'not referenced by makecomapp.json (the editor ignores it)');
}

// ---------------------------------------------------------------- base
const base = loaded[manifest.generalCodeFiles.base];
if (base) {
    const headers = base.headers ?? {};
    const authHeader = Object.keys(headers).find((h) => h.toLowerCase() === 'authorization');
    if (!authHeader) error('src/general/base.iml.jsonc', 'no authorization header');
    const sanitized = base.log?.sanitize ?? [];
    if (authHeader && !sanitized.includes(`request.headers.${authHeader}`)) error('src/general/base.iml.jsonc', `log.sanitize must contain "request.headers.${authHeader}" (exact header name)`);
    if (!base.response?.error?.message) error('src/general/base.iml.jsonc', 'response.error.message is missing (Make requires error handling in the base)');
    if (base.baseUrl !== 'https://app.searcherries.com/api/v1') error('src/general/base.iml.jsonc', `unexpected baseUrl ${base.baseUrl}`);
    for (const name of imlReferences(base, 'connection')) {
        if (!connectionParamNames().has(name)) error('src/general/base.iml.jsonc', `{{connection.${name}}} is not a parameter of any connection`);
    }
}

function connectionParamNames() {
    const names = new Set();
    for (const { codes } of Object.values(components.connection)) for (const p of paramNames(codes.params ?? [])) names.add(p);
    return names;
}

// ---------------------------------------------------------------- connections
for (const [id, { meta, codes }] of Object.entries(components.connection)) {
    const file = `src/${meta.codeFiles.communication}`;
    const comm = codes.communication;
    if (!comm) continue;
    if (!/^https:\/\/app\.searcherries\.com\//.test(comm.url ?? '')) error(file, 'connection must validate the token against an absolute API URL');
    const authHeader = Object.keys(comm.headers ?? {}).find((h) => h.toLowerCase() === 'authorization');
    if (!authHeader) error(file, 'no authorization header');
    if (authHeader && !(comm.log?.sanitize ?? []).includes(`request.headers.${authHeader}`)) error(file, `log.sanitize must contain "request.headers.${authHeader}"`);
    if (!comm.response?.error?.message) error(file, 'response.error.message is missing');
    if (!comm.response?.metadata?.value) warn(file, 'no response.metadata (connection label)');
    const declared = paramNames(codes.params ?? []);
    for (const name of imlReferences(comm, 'parameters')) if (!declared.has(name)) error(file, `{{parameters.${name}}} is not declared in the connection params`);
    for (const p of codes.params ?? []) if (p.type === 'password' && p.required !== true) warn(`src/${meta.codeFiles.params}`, `password parameter "${p.name}" is not required`);
}

// ---------------------------------------------------------------- RPCs
const moduleParamNames = new Set();
for (const { codes } of Object.values(components.module)) {
    for (const p of paramNames(codes.staticParams ?? [])) moduleParamNames.add(p);
    for (const p of paramNames(codes.mappableParams ?? [])) moduleParamNames.add(p);
}
for (const [id, { meta, codes }] of Object.entries(components.rpc)) {
    const file = `src/${meta.codeFiles.communication}`;
    const comm = codes.communication;
    if (!comm) continue;
    if (!meta.connection) error('src/makecomapp.json', `rpc "${id}" has no connection (every RPC requires one)`);
    const own = paramNames(codes.params ?? []);
    for (const name of imlReferences(comm, 'parameters')) {
        if (!own.has(name) && !moduleParamNames.has(name)) error(file, `{{parameters.${name}}} is neither an RPC parameter nor a module parameter it could inherit`);
    }
    const out = comm.response?.output;
    if (!out || (typeof out === 'object' && !Array.isArray(out) && (!('label' in out) || !('value' in out)))) error(file, 'dynamic options RPC output must have label and value');
    if (comm.response?.iterate && comm.response?.limit === undefined) warn(file, 'no response.limit (Make recommends a limit on options RPCs)');
}

// ---------------------------------------------------------------- modules
const rpcIds = new Set(Object.keys(components.rpc));
for (const [id, { meta, codes }] of Object.entries(components.module)) {
    const comm = codes.communication;
    const commFile = `src/${meta.codeFiles.communication}`;
    if (!meta.connection) error('src/makecomapp.json', `module "${id}" has no connection`);
    if (!comm) continue;
    const staticNames = paramNames(codes.staticParams ?? []);
    const mappable = paramNames(codes.mappableParams ?? []);
    const declared = new Set([...staticNames, ...mappable]);
    for (const name of imlReferences(comm, 'parameters')) if (!declared.has(name)) error(commFile, `{{parameters.${name}}} is not declared in static or mappable parameters`);
    for (const url of rpcUrls([...(codes.staticParams ?? []), ...(codes.mappableParams ?? [])])) {
        if (!rpcIds.has(url)) error(`src/${meta.codeFiles.mappableParams}`, `rpc://${url} does not exist`);
    }
    for (const codeType of ['staticParams', 'mappableParams', 'interface']) {
        const file = `src/${meta.codeFiles[codeType]}`;
        const items = codes[codeType];
        if (Array.isArray(items)) checkParameterTree(items, file);
    }
    if (meta.moduleType === 'search') {
        if (!comm.response?.iterate) error(commFile, 'search module must iterate (response.iterate)');
        if (comm.response?.limit !== '{{parameters.limit}}') error(commFile, 'search module must set response.limit to {{parameters.limit}}');
        const limit = (codes.mappableParams ?? []).find((p) => p.name === 'limit');
        if (!limit) error(`src/${meta.codeFiles.mappableParams}`, 'search module needs a `limit` mappable parameter');
        else {
            if (limit.type !== 'uinteger') error(`src/${meta.codeFiles.mappableParams}`, '`limit` should be a uinteger');
            if (limit.required) error(`src/${meta.codeFiles.mappableParams}`, '`limit` must not be required in a search module');
            if (limit.advanced) error(`src/${meta.codeFiles.mappableParams}`, '`limit` must not be advanced');
            if (limit.default !== 10) warn(`src/${meta.codeFiles.mappableParams}`, '`limit` default should be 10 (Make best practice)');
            const last = (codes.mappableParams ?? []).at(-1);
            if (last?.name !== 'limit') warn(`src/${meta.codeFiles.mappableParams}`, '`limit` should be the last standard field');
        }
        if (comm.pagination) {
            if (!comm.pagination.condition) warn(commFile, 'pagination without a stop condition');
        }
    }
    if (meta.moduleType === 'action') {
        if (comm.response?.iterate || comm.pagination) error(commFile, 'action modules return one bundle: no iterate / pagination');
        if (comm.response?.output === undefined) error(commFile, 'action module needs response.output');
    }
    if (meta.moduleType === 'universal') {
        if (meta.label !== 'Make an API call') error('src/makecomapp.json', 'universal module label must be "Make an API call"');
        // The path is typed as /v1/...: the URL must strip that slash, the API answers 404 on api//v1/... .
        const universalUrl = "https://app.searcherries.com/api/{{if(substring(parameters.url, 0, 1) == '/', substring(parameters.url, 1, length(parameters.url)), parameters.url)}}";
        if ((comm.url ?? '') !== universalUrl) error(commFile, `universal module URL must be ${universalUrl} (base host, version in the path, leading slash of the path dropped)`);
        if (comm.method !== 'GET') error(commFile, 'the Searcherries API is read-only; the universal module must send GET');
    }
    if (meta.moduleType !== 'universal' && typeof comm.url === 'string' && !comm.url.startsWith('/')) error(commFile, 'module URL should be relative to baseUrl (start with /)');
    // samples ⊆ interface
    const sample = codes.samples;
    const iface = codes.interface;
    if (sample && typeof sample === 'object' && !Array.isArray(sample) && Array.isArray(iface)) {
        const names = new Set(iface.map((p) => p.name));
        for (const key of Object.keys(sample)) if (!names.has(key)) error(`src/${meta.codeFiles.samples}`, `sample key "${key}" is not in the interface`);
        if (Object.keys(sample).length === 0) warn(`src/${meta.codeFiles.samples}`, 'empty sample');
    }
}

// ---------------------------------------------------------------- groups
const groups = loaded[manifest.generalCodeFiles.groups];
if (Array.isArray(groups)) {
    const grouped = new Set();
    for (const g of groups) for (const m of g.modules) {
        if (!components.module[m]) error('src/modules/groups.json', `group "${g.label}" lists unknown module "${m}"`);
        grouped.add(m);
    }
    for (const id of Object.keys(components.module)) if (!grouped.has(id)) error('src/modules/groups.json', `module "${id}" is not in any group (Make: "Not categorized module(s)")`);
}

// ---------------------------------------------------------------- logo
const logo = join(root, 'assets/logo.png');
if (!existsSync(logo)) error('assets/logo.png', 'missing');
else {
    const buf = readFileSync(logo);
    const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!isPng) error('assets/logo.png', 'not a PNG');
    else {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        if (width !== height) error('assets/logo.png', `not square (${width}x${height})`);
        if (width < 512 || width > 2048) error('assets/logo.png', `${width}px: Make needs 512 to 2048 px`);
        if (buf.length > 500 * 1024) error('assets/logo.png', `${buf.length} bytes: Make allows at most 500 kB`);
    }
}

// ---------------------------------------------------------------- helpers
function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const file = join(dir, name);
        if (statSync(file).isDirectory()) out.push(...walk(file));
        else out.push(file);
    }
    return out;
}

/** Names declared by a parameters array, including nested parameters at any depth. */
function paramNames(params, into = new Set()) {
    if (typeof params === 'string') return into; // rpc:// reference
    for (const p of params ?? []) {
        if (typeof p !== 'object' || p === null) continue;
        if (p.name) into.add(p.name);
        collectNested(p.nested, into);
        if (p.options && typeof p.options === 'object' && !Array.isArray(p.options)) {
            collectNested(p.options.nested, into);
            collectNested(p.options.placeholder?.nested, into);
            if (Array.isArray(p.options.store)) for (const o of p.options.store) collectNested(o?.nested, into);
        }
        if (Array.isArray(p.options)) for (const o of p.options) collectNested(o?.nested, into);
        if (p.rpc?.parameters) paramNames(p.rpc.parameters, into);
    }
    return into;
}
function collectNested(nested, into) {
    if (!nested) return;
    if (Array.isArray(nested)) return paramNames(nested, into);
    if (typeof nested === 'object') {
        if (Array.isArray(nested.store)) paramNames(nested.store, into);
        if (Array.isArray(nested.true)) paramNames(nested.true, into);
        if (Array.isArray(nested.false)) paramNames(nested.false, into);
    }
}

function rpcUrls(params, into = new Set()) {
    const visit = (node) => {
        if (typeof node === 'string') {
            const m = node.match(/^rpc:\/\/([A-Za-z0-9]+)/);
            if (m) into.add(m[1]);
        } else if (Array.isArray(node)) node.forEach(visit);
        else if (node && typeof node === 'object') Object.values(node).forEach(visit);
    };
    visit(params);
    return into;
}

/** `{{ ... namespace.NAME ... }}` references inside every string of a code block. */
function imlReferences(node, namespace, into = new Set()) {
    const visit = (value) => {
        if (typeof value === 'string') {
            for (const expr of value.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
                for (const m of expr[1].matchAll(new RegExp(`(?<![A-Za-z0-9_.])${namespace}\\.([A-Za-z_][A-Za-z0-9_]*)`, 'g'))) into.add(m[1]);
            }
        } else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(node);
    return into;
}

function checkImlBraces(node, file) {
    const visit = (value, path) => {
        if (typeof value === 'string') {
            const open = (value.match(/\{\{/g) ?? []).length;
            const close = (value.match(/\}\}/g) ?? []).length;
            if (open !== close) error(file, `unbalanced {{ }} in ${path}: ${value.slice(0, 60)}`);
        } else if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${path}[${i}]`));
        else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) visit(v, path ? `${path}.${k}` : k);
    };
    visit(node, '');
}

function checkParameterTree(params, file, path = '') {
    const seen = new Set();
    params.forEach((p, i) => {
        if (typeof p === 'string') return; // rpc:// in interface
        const here = `${path}[${i}]`;
        if (!p.name) error(file, `${here}: parameter without name`);
        if (!p.type) error(file, `${here}: parameter without type`);
        if (!p.label) warn(file, `${here} (${p.name}): parameter without label`);
        if (p.name && seen.has(p.name)) error(file, `${here}: duplicate parameter name "${p.name}"`);
        seen.add(p.name);
        if (Array.isArray(p.spec)) checkParameterTree(p.spec, file, `${here}.spec`);
        if (Array.isArray(p.nested)) checkParameterTree(p.nested, file, `${here}.nested`);
        if (p.options && typeof p.options === 'object' && !Array.isArray(p.options) && Array.isArray(p.options.nested)) checkParameterTree(p.options.nested, file, `${here}.options.nested`);
    });
}

// ---------------------------------------------------------------- report
const moduleCount = Object.keys(components.module).length;
console.log(`Checked ${referencedFiles.size + 1} files: ${moduleCount} modules, ${Object.keys(components.rpc).length} RPCs, ${Object.keys(components.connection).length} connection.`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(errors.length === 0 ? `OK (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : `${errors.length} error${errors.length === 1 ? '' : 's'}`);
process.exit(errors.length === 0 ? 0 : 1);
