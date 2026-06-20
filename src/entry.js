/* eslint strict: off */
'use strict';
(() => {
	// Don't run on certain sub-domains.
	if ( /^(?:localhost\.rig|blog|im|chatdepot|tmi|api|brand|dev|gql|passport)\./.test(location.hostname) )
		return;

	if ( /disable_frankerfacez/.test(location.search) )
		return;

	if ( document.body.dataset.ffzSource ) {
		console.log(
			'%c FFZ Fork %c loader SKIPPED — FrankerFaceZ was already loaded by "' + document.body.dataset.ffzSource + '". Disable the other FFZ (e.g. the official extension/userscript) to use this build.',
			'background:#755000;color:#fff;border-radius:3px;font-weight:bold', 'color:inherit'
		);
		return;
	}

	document.body.dataset.ffzSource = 'script';

	const DEBUG = localStorage.ffzDebugMode == 'true' && document.body.classList.contains('ffz-dev'),
		HOST = location.hostname,
		// The non-debug code host is injected at build time from the FFZ_CDN env
		// var via the CopyPlugin transform in webpack.config.js (defaults to the
		// FFZ CDN). Set FFZ_CDN to your own DigitalOcean host to serve your build.
		SERVER = DEBUG ? '//localhost:8000' : '__FFZ_CDN__',
		script = document.createElement('script');

	let FLAVOR =
			HOST.includes('player') ? 'player' :
				HOST.includes('clips') ? 'clips' :
					(location.pathname === '/p/ffz_bridge/' ? 'bridge' : 'avalon');

	if (FLAVOR === 'clips' && location.pathname === '/embed')
		FLAVOR = 'player';

	console.log(
		'%c FFZ Fork %c loader running — loading "' + FLAVOR + '" from ' + SERVER + (SERVER.indexOf('cdn2.frankerfacez.com') !== -1 ? '  ⚠️ this is the ORIGINAL FFZ CDN — set FFZ_CDN in your DO build to your own host!' : ''),
		'background:#755000;color:#fff;border-radius:3px;font-weight:bold', 'color:inherit'
	);

	script.id = 'ffz-script';
	script.async = true;
	script.crossOrigin = 'anonymous';
	script.src = `${SERVER}/script/${FLAVOR}.js?_=${Date.now()}`;
	document.head.appendChild(script);
})();
