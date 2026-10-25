/* eslint-disable */
// Zips dist/extension (built by `bun run build:ext`) into a Chrome Web Store
// upload package: dist/smokeyz-<version>.zip. manifest.json must sit at the
// root of the archive.
//
//   node bin/package_extension.js

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '../dist/extension');
const manifest_path = path.join(ROOT, 'manifest.json');

if ( ! fs.existsSync(manifest_path) ) {
	console.error('dist/extension/manifest.json not found. Run `bun run build:ext` first.');
	process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifest_path, 'utf8'));
const zip = new JSZip();
let count = 0;

function add(dir) {
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() )
			add(full);
		else if ( ! entry.name.endsWith('.map') ) {
			zip.file(path.relative(ROOT, full).split(path.sep).join('/'), fs.readFileSync(full));
			count++;
		}
	}
}

add(ROOT);

zip.generateAsync({
	type: 'nodebuffer',
	compression: 'DEFLATE',
	compressionOptions: {level: 9}
}).then(buf => {
	const out = path.resolve(__dirname, `../dist/smokeyz-${manifest.version}.zip`);
	fs.writeFileSync(out, buf);
	console.log(`${path.relative(process.cwd(), out)}: ${count} files, ${(buf.length / 1024 / 1024).toFixed(2)} MiB`);
});
