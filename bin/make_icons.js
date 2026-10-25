/* eslint-disable */
// Generates the extension's pixel-art dog icons (extension/icons/icon*.png)
// from the 16x16 sprite below. Pure node, no dependencies:
//
//   node bin/make_icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PALETTE = {
	K: [0x2b, 0x1b, 0x12], // outline
	D: [0x7a, 0x4a, 0x24], // ears
	T: [0xc8, 0x89, 0x4a], // fur
	C: [0xf3, 0xdf, 0xc1], // muzzle
	W: [0xff, 0xff, 0xff], // eye glint
	N: [0x11, 0x11, 0x11], // nose
	R: [0xe8, 0x75, 0x8a]  // tongue
};

const SPRITE = [
	'..KKK......KKK..',
	'.KDDDKKKKKKDDDK.',
	'.KDDDTTTTTTDDDK.',
	'.KDDTTTTTTTTDDK.',
	'.KDDTKTTTTKTDDK.',
	'.KDDTKTTTTKTDDK.',
	'.KDDTTCCCCTTDDK.',
	'.KDDTCCNNCCTDDK.',
	'.KDDTCCCCCCTDDK.',
	'..KDTCKKKKCTDK..',
	'..KKKKCRRCKKKK..',
	'....KKKKKKKK....'
];

const GRID = 16;

// Pad the sprite to a square grid, vertically centered.
const top = Math.floor((GRID - SPRITE.length) / 2);
const rows = [
	...Array(top).fill('.'.repeat(GRID)),
	...SPRITE,
	...Array(GRID - top - SPRITE.length).fill('.'.repeat(GRID))
];

// Each icon is the sprite scaled by an integer factor and centered on the
// canvas. The 128px icon leaves the 16px transparent padding the Chrome Web
// Store asks for (96px of artwork).
const ICONS = [
	{size: 16, scale: 1},
	{size: 32, scale: 2},
	{size: 48, scale: 3},
	{size: 128, scale: 6}
];

function crc(buf) {
	return zlib.crc32(buf) >>> 0;
}

function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, 'ascii');
	data.copy(out, 8);
	out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}

function png(size, pixels) {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8; // bit depth
	header[9] = 6; // RGBA

	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0; // filter: none
		pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
	}

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', zlib.deflateSync(raw, {level: 9})),
		chunk('IEND', Buffer.alloc(0))
	]);
}

const out_dir = path.resolve(__dirname, '../extension/icons');
fs.mkdirSync(out_dir, {recursive: true});

for (const {size, scale} of ICONS) {
	const pixels = Buffer.alloc(size * size * 4); // transparent
	const offset = Math.floor((size - GRID * scale) / 2);

	for (let gy = 0; gy < GRID; gy++)
		for (let gx = 0; gx < GRID; gx++) {
			const color = PALETTE[rows[gy][gx]];
			if (! color)
				continue;

			for (let dy = 0; dy < scale; dy++)
				for (let dx = 0; dx < scale; dx++) {
					const i = ((offset + gy * scale + dy) * size + offset + gx * scale + dx) * 4;
					pixels[i] = color[0];
					pixels[i + 1] = color[1];
					pixels[i + 2] = color[2];
					pixels[i + 3] = 255;
				}
		}

	fs.writeFileSync(path.join(out_dir, `icon${size}.png`), png(size, pixels));
	console.log(`icon${size}.png`);
}
