/* global module __dirname */

const path = require('path');
const semver = require('semver');
const {exec, execSync, execFileSync} = require('child_process');

const { CycloneDxWebpackPlugin } = require('@cyclonedx/webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const { EsbuildPlugin } = require('esbuild-loader');
const CopyPlugin = require('copy-webpack-plugin');


if ( process.env.NODE_ENV == null )
	process.env.NODE_ENV = 'production';

// Are we in development?
const DEV_SERVER = process.env.WEBPACK_SERVE == 'true';
const DEV_BUILD = process.env.NODE_ENV !== 'production';

// Is this for an extension?
const FOR_EXTENSION = !! process.env.FFZ_EXTENSION;

// --- Distribution host (DigitalOcean) ---------------------------------------
// Where YOUR built client is hosted: the loader (src/entry.js) and the webpack
// code chunks load from here. Defaults to the upstream FFZ CDN, so an unset
// build behaves like upstream; set FFZ_CDN to your own DO host to serve your
// custom build from there. DATA + static assets still come from FFZ — the
// runtime hosts in src/utilities/constants.ts (SERVER, API_SERVER, images) are
// intentionally left at FFZ's defaults.
const stripSlash = value => value.replace(/\/+$/, '');
const CDN_BASE = stripSlash(process.env.FFZ_CDN || 'https://cdn2.frankerfacez.com');

// For the production build, lay the output under /script and /static so a plain
// static host (a DO App Platform static site) can serve dist/ as-is. The dev
// server and the extension build are unaffected.
const CDN_LAYOUT = ! FOR_EXTENSION && ! DEV_SERVER && ! DEV_BUILD;
const SCRIPT_DIR = CDN_LAYOUT ? 'script/' : '';
const STATIC_DIR = CDN_LAYOUT ? 'static/' : '';

// Get the public path. With the CDN layout, publicPath is the host root and the
// /static prefix lives in the chunk/asset filenames below.
const FILE_PATH = DEV_SERVER
	? 'https://localhost:8000/script/'
	: FOR_EXTENSION
		? ''
		: `${CDN_BASE}/`;


console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('FOR_EXTENSION:', FOR_EXTENSION, FOR_EXTENSION ? ` (${process.env.FFZ_EXTENSION})` : '');
console.log('IS_DEV_BUILD:', DEV_BUILD);
console.log('IS SERVE:', DEV_SERVER);
console.log('FILE PATH:', FILE_PATH);
console.log('FFZ_CDN (code host):', CDN_BASE);


// Version Stuff
const VERSION = semver.parse(require('./package.json').version);
const commit_hash = DEV_SERVER
	? null
	: process.env.CLIENT_COMMIT?.length > 0
		? process.env.CLIENT_COMMIT
		: execSync('git rev-parse HEAD').toString().trim();

// Build number: how many commits this fork is ahead of the upstream FFZ release
// it's based on. The base is the most recent commit whose message is a version
// number (FFZ tags releases like "4.81.0"), so the count resets to 1 each time
// you sync a new FFZ version. It's surfaced as the 4th version component, e.g.
// 4.81.0.5 (see src/main.ts). Override with the FFZ_BUILD env var if you want
// to set it explicitly. (Requires full git history — true for a normal clone.)
const build_number = DEV_SERVER
	? null
	: process.env.FFZ_BUILD?.length > 0
		? process.env.FFZ_BUILD
		: (() => {
			try {
				const base = execFileSync('git', ['log', '-1', '-E', '--grep=^[0-9]+\\.[0-9]+\\.[0-9]+', '--format=%H']).toString().trim();
				if ( ! base )
					return null;
				const count = execFileSync('git', ['rev-list', '--count', `${base}..HEAD`]).toString().trim();
				return (count && count !== '0') ? count : null;
			} catch {
				return null;
			}
		})();

console.log('BUILD NUMBER:', build_number);


// The Config

const ENTRY_POINTS = {
	bridge: './src/bridge.js',
	esbridge: './src/esbridge.js',
	player: './src/player.js',
	avalon: './src/main.ts',
	clips: './src/clips.js'
};

if ( FOR_EXTENSION )
	ENTRY_POINTS.worker = './src/worker.ts';

const COPY_PATTERNS = [
	{
		from: FOR_EXTENSION
			? './src/entry_ext.js'
			: './src/entry.js',
		to: `${SCRIPT_DIR}${(DEV_SERVER || DEV_BUILD) ? 'script.js' : 'script.min.js'}`,
		// The loader runs before the bundle and is copied verbatim (not run
		// through esbuild), so inject the configured code host here by replacing
		// the __FFZ_CDN__ placeholder in src/entry.js.
		transform: content => content.toString().replaceAll('__FFZ_CDN__', CDN_BASE)
	},
];

// The userscript injector (the installable .user.js). Served alongside the
// loader so the install + auto-update URL live on your own host. Same
// __FFZ_CDN__ -> host substitution as the loader. Not needed for the extension.
if ( ! FOR_EXTENSION )
	COPY_PATTERNS.push({
		from: './src/injector.user.js',
		to: `${SCRIPT_DIR}ffz_injector.user.js`,
		transform: content => content.toString().replaceAll('__FFZ_CDN__', CDN_BASE)
	});

const TARGET = 'es2020';

/** @type {import('webpack').Configuration} */
const config = {
	mode: DEV_BUILD
		? 'development'
		: 'production',
	devtool: DEV_BUILD
		? 'inline-source-map'
		: 'source-map',

	target: ['web', TARGET],

	resolve: {
		extensions: ['.js', '.jsx', '.ts', '.tsx'],
		alias: {
			res: path.resolve(__dirname, 'res/'),
			styles: path.resolve(__dirname, 'styles/'),
			root: __dirname,
			src: path.resolve(__dirname, 'src/'),
			utilities: path.resolve(__dirname, 'src/utilities/'),
			site: path.resolve(__dirname, 'src/sites/twitch-twilight/')
		}
	},

	node: {
		global: false
	},

	entry: ENTRY_POINTS,

	externals: [
		({context, request}, callback) => {
			if ( request === 'vue' && ! /utilities/.test(context) )
				return callback(null, 'root ffzVue');

			callback();
		}
	],

	output: {
		chunkFormat: 'array-push',
		clean: true,
		publicPath: FOR_EXTENSION
			? 'auto'
			: FILE_PATH,
		path: path.resolve(__dirname, 'dist'),
		// Entry bundles use stable names so the loader can request them at a
		// fixed /script/{flavor}.js path (it cache-busts with ?_=<ts>); chunks
		// keep content hashes. With CDN_LAYOUT they go under /script and /static.
		filename: CDN_LAYOUT
			? `${SCRIPT_DIR}[name].js`
			: (FOR_EXTENSION || DEV_SERVER) ? '[name].js' : '[name].[contenthash:8].js',
		chunkFilename: CDN_LAYOUT
			? `${STATIC_DIR}[name].[contenthash:8].js`
			: (FOR_EXTENSION || DEV_SERVER) ? '[name].js' : '[name].[contenthash:8].js',
		chunkLoadingGlobal: 'ffzWebpackJsonp',
		crossOriginLoading: 'anonymous'
	},

	optimization: {
		minimizer: [
			new EsbuildPlugin({
				target: TARGET,
				keepNames: true,
				// Don't minify the copied userscript injector — minification strips
				// its ==UserScript== metadata block and breaks installation.
				exclude: /\.user\.js$/
			})
		],
		splitChunks: {
			chunks(chunk) {
				return ! Object.keys(ENTRY_POINTS).includes(chunk.name);
			},
			cacheGroups: {
				vendors: false
			}
		}
	},

	performance: {
		hints: false,
	},

	plugins: [
		new CycloneDxWebpackPlugin({
			specVersion: '1.6',
			outputLocation: './bom',
			includeWellknown: false
		}),
		new CopyPlugin({
			patterns: COPY_PATTERNS
		}),
		new VueLoaderPlugin(),
		new EsbuildPlugin({
			define: {
				__version_major__: JSON.stringify(VERSION.major),
				__version_minor__: JSON.stringify(VERSION.minor),
				__version_patch__: JSON.stringify(VERSION.patch),
				__version_prerelease__: JSON.stringify(VERSION.prerelease),
				__version_build__: JSON.stringify(build_number),
				__git_commit__: JSON.stringify(commit_hash),
				__extension__: FOR_EXTENSION
					? JSON.stringify(process.env.FFZ_EXTENSION)
					: JSON.stringify(false)
			},
			// Leave the copied userscript injector alone so its ==UserScript==
			// metadata comment survives (esbuild would otherwise strip comments).
			exclude: /\.user\.js$/
		}),
		new WebpackManifestPlugin({
			publicPath: ''
		})
	],

	module: {
		rules: [
			{
				test: /\.jsx?$/,
				exclude: /node_modules/,
				loader: 'esbuild-loader',
				options: {
					loader: 'jsx',
					jsxFactory: 'createElement',
					target: TARGET
				}
			},
			{
				test: /\.tsx?$/,
				exclude: /node_modules/,
				loader: 'esbuild-loader',
				options: {
					loader: 'tsx',
					jsxFactory: 'createElement',
					target: TARGET
				}
			},
			{
				test: /\.(graphql|gql)$/,
				exclude: /node_modules/,
				use: [
					'graphql-tag/loader',
					'minify-graphql-loader'
				]
			},
			{
				test: /\.json$/,
				include: /src/,
				type: 'asset/resource',
				generator: {
					filename: (FOR_EXTENSION || DEV_BUILD)
						? '[name].json'
						: `${STATIC_DIR}[name].[contenthash:8].json`
				}
			},
			{
				// This stupid rule goes out to Mozilla, who consistantly
				// manage to have this one file not included in the bundle
				// the same way as every other build on every other machine
				// out of like twelve I've tested. So fine. We'll do it
				// your way. Whatever. I don't care.
				test: /entities.json$/,
				include: /node_modules/,
				type: 'asset/resource',
				generator: {
					filename: (FOR_EXTENSION || DEV_BUILD)
						? '[name].json'
						: `${STATIC_DIR}[name].[contenthash:8].json`
				}
			},
			{
				test: /\.(?:otf|eot|ttf|woff|woff2)$/,
				use: [{
					loader: 'file-loader',
					options: {
						name: (FOR_EXTENSION || DEV_BUILD)
							? '[name].[ext]'
							: `${STATIC_DIR}[name].[contenthash:8].[ext]`
					}
				}]
			},
			{
				test: /\.md$/,
				type: 'asset/source',
			},
			{
				test: /\.svg$/,
				type: 'asset/source'
			},
			{
				test: /\.vue$/,
				loader: 'vue-loader'
			},
			{
				test: /\.(?:sa|sc|c)ss$/,
				resourceQuery: {
					not: [
						/css_tweaks/
					]
				},
				use: [
					{
						loader: 'file-loader',
						options: {
							name: (FOR_EXTENSION || DEV_BUILD)
								? '[name].css'
								: `${STATIC_DIR}[name].[contenthash:8].css`
						}
					},
					{
						loader: 'extract-loader',
						options: {
							// CDN layout: the CSS lives at /static/*.css and is loaded
							// cross-origin from twitch.tv, so font/asset url()s inside it
							// must be ABSOLUTE to the CDN host. A relative url() resolves
							// against the stylesheet's own /static/ dir (doubling it) and
							// 404s. Non-CDN builds keep CSS + assets co-located, so '' is fine.
							publicPath: CDN_LAYOUT ? `${CDN_BASE}/` : ''
						}
					},
					{
						loader: 'css-loader',
						options: {
							esModule: false,
							sourceMap: DEV_BUILD ? true : false
						}
					},
					{
						loader: 'sass-loader',
						options: {
							sourceMap: true
						}
					}
				]
			},
			{
				test: /\.(?:sa|sc|c)ss$/,
				resourceQuery: /css_tweaks/,
				use: [
					{
						loader: 'raw-loader'
					},
					{
						loader: 'extract-loader'
					},
					{
						loader: 'css-loader',
						options: {
							esModule: false,
							sourceMap: DEV_BUILD ? true : false
						}
					},
					{
						loader: 'sass-loader',
						options: {
							sourceMap: false
						}
					}
				]
			}
		]
	}

};

if ( DEV_SERVER )
	config.devServer = {
		client: false,
		webSocketServer: false,
		liveReload: false,
		hot: false,

		server: 'https',
		port: 8000,
		compress: true,

		allowedHosts: [
			'.twitch.tv',
			'.frankerfacez.com'
		],

		static: {
			directory: path.join(__dirname, 'dev_cdn'),
		},

		devMiddleware: {
			publicPath: '/script/',
		},

		proxy: [
			{
				context: ['**'],
				target: 'https://cdn2.frankerfacez.com/',
				changeOrigin: true
			},
		],

		setupMiddlewares: (middlewares, devServer) => {

			devServer.app.get('/script/script.min.js', (req, res) => {
				res.redirect('/script/script.js');
			});

			devServer.app.get('/update_font', (req, res) => {
				const proc = exec('bun run font:save');

				proc.stdout.on('data', data => {
					console.log('FONT>>', data);
				});

				proc.stderr.on('data', data => {
					console.error('FONT>>', data);
				});

				proc.on('close', code => {
					console.log('FONT>> Exited with code', code);
					res.redirect(req.headers.referer);
				});
			});

			devServer.app.get('/dev_server', (req, res) => {
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Private-Network', 'true');

				res.json({
					path: process.cwd(),
					version: 2
				})
			});

			middlewares.unshift((req, res, next) => {
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Private-Network', 'true');
				next();
			});

			return middlewares.filter(middleware => middleware.name !== 'cross-origin-header-check');
		}
	};


module.exports = config;
