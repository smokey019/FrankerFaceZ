/* eslint-disable */
// Bundles the FrankerFaceZ add-on catalog into the extension build
// (dist/extension/web/addons.json and dist/extension/web/addons/<id>/...), so
// add-ons load from the extension itself instead of a CDN. Extensions may not
// execute remotely hosted code, so everything an add-on loads (its script, lazy
// chunks and stylesheets) has to be in the package. Runs after webpack:
//
//   node bin/fetch_addons.js
//
// FFZ_ADDON_CDN      Host to fetch add-ons from (default: https://cdn2.frankerfacez.com)
// FFZ_ADDON_EXCLUDE  Comma-separated add-on ids to leave out
//
// The catalog and the add-on scripts are remote content. Nothing from them is
// ever executed here, and every id and file name is validated before it is
// used in a URL or a file path.

const fs = require('fs');
const path = require('path');

const CDN = (process.env.FFZ_ADDON_CDN || 'https://cdn2.frankerfacez.com').replace(/\/+$/, '');
const EXCLUDE = (process.env.FFZ_ADDON_EXCLUDE || '').split(',').map(x => x.trim()).filter(Boolean);
const WEB = path.resolve(__dirname, '../dist/extension/web');
const ADDONS = path.join(WEB, 'addons');

// Add-ons are webpack bundles that hard-code their public path to the CDN.
const PUBLIC_PATH = /\.p="https?:\/\/[^"]*\/static\/addons\/"/g;
const EXT_PUBLIC_PATH = '.p=FrankerFaceZ.utilities.constants.SERVER_OR_EXT+"/addons/"';

// Add-on ids and file names must not be able to escape the add-ons directory
// or alter the URL they are fetched from.
const ID_RE = /^[A-Za-z0-9_-]+$/;
const NAME_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

if ( ! fs.existsSync(WEB) ) {
	console.error('dist/extension/web not found. Run the extension webpack build first.');
	process.exit(1);
}

async function get(url) {
	const resp = await fetch(url, {redirect: 'follow'});
	if ( ! resp.ok )
		throw new Error(`${resp.status} ${url}`);
	return resp;
}

function checkName(name) {
	if ( typeof name !== 'string' || ! NAME_RE.test(name) || name.split('/').some(part => part === '.' || part === '..') )
		throw new Error(`unsafe file name: ${JSON.stringify(name)}`);
	return name;
}

function write(rel, data) {
	const file = path.resolve(ADDONS, checkName(rel));
	if ( ! file.startsWith(ADDONS + path.sep) )
		throw new Error(`path escapes the add-ons directory: ${rel}`);

	fs.mkdirSync(path.dirname(file), {recursive: true});
	fs.writeFileSync(file, data);
}

/** Splits a JS expression on top-level `+`, ignoring strings and brackets. */
function splitTerms(expr) {
	const terms = [];
	let depth = 0, start = 0, quoted = false;
	for(let i = 0; i < expr.length; i++) {
		const c = expr[i];
		if ( quoted ) {
			if ( c === '"' )
				quoted = false;
		} else if ( c === '"' )
			quoted = true;
		else if ( c === '(' || c === '{' || c === '[' )
			depth++;
		else if ( c === ')' || c === '}' || c === ']' )
			depth--;
		else if ( c === '+' && depth === 0 ) {
			terms.push(expr.slice(start, i));
			start = i + 1;
		}
	}

	terms.push(expr.slice(start));
	return terms;
}

/** Parses the body of a `{123:"value",...}` object literal. */
function parseMap(body) {
	if ( ! /^(?:\d+:"[^"\x5c]*"(?:,|$))*$/.test(body) )
		throw new Error('unexpected chunk map');

	return new Map([...body.matchAll(/(\d+):"([^"\x5c]*)"/g)].map(m => [m[1], m[2]]));
}

/**
 * Every chunk file name the add-on's webpack runtime can request. The runtime
 * builds them with a `.u` arrow function. That function is remote code, so it
 * is never evaluated: this understands the few shapes webpack generates and
 * refuses anything else.
 */
function chunkNames(source) {
	const match = /\.u=([^;]*?),[\w$]+\.o=\(/.exec(source);
	if ( ! match )
		return [];

	const header = /^\(?([A-Za-z_$][\w$]*)\)?=>/.exec(match[1]);
	if ( ! header )
		throw new Error('unexpected chunk name function');

	const P = header[1].replace(/\$/g, String.raw`\$`);
	const terms = splitTerms(match[1].slice(header[0].length)).map(term => {
		let m;

		// "text"
		if ( (m = /^"([^"\x5c]*)"$/.exec(term)) )
			return () => m[1];

		// (t===123?"name":t)
		if ( (m = new RegExp(String.raw`^\(${P}===(\d+)\?"([^"\x5c]*)":${P}\)$`).exec(term)) )
			return id => id === m[1] ? m[2] : id;

		// ({123:"name"}[t]||t)
		if ( (m = new RegExp(String.raw`^\(\{([^{}]*)\}\[${P}\]\|\|${P}\)$`).exec(term)) ) {
			const map = parseMap(m[1]);
			return id => map.get(id) ?? id;
		}

		// {123:"hash"}[t]
		if ( (m = new RegExp(String.raw`^\{([^{}]*)\}\[${P}\]$`).exec(term)) ) {
			const map = parseMap(m[1]);
			return id => map.get(id);
		}

		// t
		if ( term === header[1] )
			return id => id;

		throw new Error('unexpected chunk name function');
	});

	// Every chunk id the function knows about appears as a number in it.
	const ids = new Set(['0', ...(match[1].match(/\b\d{1,6}\b/g) || [])]);
	const names = new Set;
	for(const id of ids) {
		const parts = terms.map(term => term(id));
		if ( parts.every(part => part !== undefined) ) {
			const name = parts.join('');
			if ( /\.(?:js|css)$/.test(name) )
				names.add(name);
		}
	}

	return [...names];
}

/** Files referenced as `<publicPath> + "literal"`, such as stylesheets and JSON. */
function assetNames(source) {
	return [...source.matchAll(/\.p\+"([^"]+)"/g)].map(m => m[1]);
}

async function bundleAddon(addon) {
	const id = addon.id;
	if ( typeof id !== 'string' || ! ID_RE.test(id) )
		throw new Error(`unsafe add-on id: ${JSON.stringify(id)}`);

	const main = await (await get(`${CDN}/script/addons/${id}/script.js`)).text();
	const seen = new Set;
	const queue = [...chunkNames(main), ...assetNames(main)];

	if ( ! /FrankerFaceZ/.test(main) )
		throw new Error('does not look like an add-on script');

	while ( queue.length ) {
		const name = checkName(queue.shift());
		if ( seen.has(name) )
			continue;

		seen.add(name);
		const body = Buffer.from(await (await get(`${CDN}/static/addons/${name}`)).arrayBuffer());
		write(name, body);
		if ( name.endsWith('.js') )
			queue.push(...assetNames(body.toString('utf8')));
	}

	write(`${id}/script.js`, main.replace(PUBLIC_PATH, EXT_PUBLIC_PATH));

	if ( /static\/addons\/[^"'`]*\.(?:js|css|json)\b/.test(main.replace(PUBLIC_PATH, '')) )
		console.warn(`  ${id}: still loads files from ${CDN}/static/addons/ after rewriting`);

	return seen.size;
}

async function main() {
	const catalog = await (await get(`${CDN}/script/addons.json`)).json();
	if ( ! Array.isArray(catalog) || ! catalog.length )
		throw new Error('add-on catalog is empty');

	fs.rmSync(ADDONS, {recursive: true, force: true});

	const wanted = catalog.filter(addon => ! EXCLUDE.includes(addon?.id));
	const kept = [];
	const failed = [];
	let next = 0;

	// A small worker pool, so we don't open 40 connections at once.
	await Promise.all(Array.from({length: 6}, async () => {
		while ( next < wanted.length ) {
			const addon = wanted[next++];
			try {
				const extra = await bundleAddon(addon);
				kept.push(addon);
				console.log(`${addon.id} ${addon.version} (+${extra} files)`);
			} catch(err) {
				failed.push(addon?.id);
				console.warn(`SKIPPED ${addon?.id}: ${err.message}`);
			}
		}
	}));

	// Keep the catalog's order, and only list add-ons we could actually bundle.
	const order = new Map(catalog.map((addon, i) => [addon.id, i]));
	kept.sort((a, b) => order.get(a.id) - order.get(b.id));
	fs.writeFileSync(path.join(WEB, 'addons.json'), JSON.stringify(kept));

	console.log(`Bundled ${kept.length} of ${catalog.length} add-ons` + (EXCLUDE.length ? ` (${EXCLUDE.length} excluded)` : '') + (failed.length ? `, ${failed.length} failed` : ''));
	if ( failed.length )
		process.exitCode = 1;
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
