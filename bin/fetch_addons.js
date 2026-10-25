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

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CDN = (process.env.FFZ_ADDON_CDN || 'https://cdn2.frankerfacez.com').replace(/\/+$/, '');
const EXCLUDE = (process.env.FFZ_ADDON_EXCLUDE || '').split(',').map(x => x.trim()).filter(Boolean);
const WEB = path.resolve(__dirname, '../dist/extension/web');
const ADDONS = path.join(WEB, 'addons');

// Add-ons are webpack bundles that hard-code their public path to the CDN.
const PUBLIC_PATH = /\.p="https?:\/\/[^"]*\/static\/addons\/"/g;
const EXT_PUBLIC_PATH = '.p=FrankerFaceZ.utilities.constants.SERVER_OR_EXT+"/addons/"';

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

function write(rel, data) {
	const file = path.join(ADDONS, rel);
	fs.mkdirSync(path.dirname(file), {recursive: true});
	fs.writeFileSync(file, data);
}

/** Every chunk file name the add-on's webpack runtime can request, from its `.u` function. */
function chunkNames(source) {
	const match = /\.u=([^;]*?),[\w$]+\.o=\(/.exec(source);
	if ( ! match )
		return [];

	let fn;
	try {
		fn = vm.runInNewContext(`(${match[1]})`, Object.create(null), {timeout: 1000});
	} catch(err) {
		throw new Error(`unable to evaluate chunk name function: ${err.message}`);
	}

	const names = new Set;
	const ids = new Set(['0', ...(match[1].match(/\b\d{1,6}\b/g) || [])]);
	for(const id of ids) {
		try {
			const name = fn(Number(id));
			if ( typeof name === 'string' && ! name.includes('undefined') && /\.(?:js|css)$/.test(name) )
				names.add(name);
		} catch(err) { /* not a chunk id */ }
	}

	return [...names];
}

/** Files referenced as `<publicPath> + "literal"`, such as stylesheets and JSON. */
function assetNames(source) {
	return [...source.matchAll(/\.p\+"([^"]+)"/g)].map(m => m[1]);
}

async function bundleAddon(addon) {
	const id = addon.id;
	const main = await (await get(`${CDN}/script/addons/${id}/script.js`)).text();
	const seen = new Set;
	const queue = [...chunkNames(main), ...assetNames(main)];

	if ( ! /FrankerFaceZ/.test(main) )
		throw new Error('does not look like an add-on script');

	while ( queue.length ) {
		const name = queue.shift();
		if ( seen.has(name) )
			continue;

		seen.add(name);
		const body = Buffer.from(await (await get(`${CDN}/static/addons/${name}`)).arrayBuffer());
		write(name, body);
		if ( name.endsWith('.js') )
			queue.push(...assetNames(body.toString('utf8')));
	}

	write(`${id}/script.js`, main.replace(PUBLIC_PATH, EXT_PUBLIC_PATH));

	if ( /static\/addons\/[^"'`]*\.(?:js|css|json)/.test(main.replace(PUBLIC_PATH, '')) )
		console.warn(`  ${id}: still loads files from ${CDN}/static/addons/ after rewriting`);

	return seen.size;
}

async function main() {
	const catalog = await (await get(`${CDN}/script/addons.json`)).json();
	if ( ! Array.isArray(catalog) || ! catalog.length )
		throw new Error('add-on catalog is empty');

	fs.rmSync(ADDONS, {recursive: true, force: true});

	const wanted = catalog.filter(addon => ! EXCLUDE.includes(addon.id));
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
				failed.push(addon.id);
				console.warn(`SKIPPED ${addon.id}: ${err.message}`);
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
