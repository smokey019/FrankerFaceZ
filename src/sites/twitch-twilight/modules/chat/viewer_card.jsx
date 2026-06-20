'use strict';

import Module from 'utilities/module';

import SESSION_LOGS_CSS from './viewer-card-logs.scss?css_tweaks';

// ============================================================================
// Vanilla Viewer Cards
// ============================================================================

export default class ViewerCards extends Module {
	constructor(...args) {
		super(...args);

		this.inject('chat');
		this.inject('settings');
		this.inject('site');
		this.inject('site.css_tweaks');
		this.inject('site.fine');

		this.last_login = null;

		// Session chat logs. Kept in-memory only, keyed by lower-case login. The
		// whole map is cleared when the active channel changes (switching streams);
		// a page refresh clears it for free. This lets non-moderators review a
		// user's recent messages, which Twitch normally only shows to mods.
		this.session_logs = new Map();
		this.current_room_id = null;
		this.LOG_LIMIT = 200;

		this.settings.add('chat.viewer-cards.highlight-chat', {
			default: false,
			ui: {
				path: 'Chat > Viewer Cards >> Appearance',
				title: 'Highlight messages from users with open viewer cards.',
				component: 'setting-check-box'
			}
		});

		this.settings.add('chat.viewer-cards.color', {
			default: '',
			ui: {
				path: 'Chat > Viewer Cards >> Appearance',
				title: 'Highlight Color',
				component: 'setting-color-box'
			}
		});

		this.settings.add('chat.viewer-cards.use-color', {
			requires: ['chat.viewer-cards.highlight-chat', 'chat.viewer-cards.color'],
			process(ctx) {
				if ( ctx.get('chat.viewer-cards.highlight-chat') )
					return ctx.get('chat.viewer-cards.color');
			}
		})

		this.settings.add('chat.viewer-cards.session-logs', {
			default: true,
			ui: {
				path: 'Chat > Viewer Cards >> Session Logs',
				title: 'Show session chat logs.',
				description: 'Add a collapsable list of a user\'s chat messages from the current session to their viewer card. Messages are stored locally only and are cleared when you refresh the page or switch channels, so you can review what a user said even without moderator access.',
				component: 'setting-check-box'
			}
		});

		this.settings.add('chat.viewer-cards.session-logs.start-open', {
			default: false,
			ui: {
				path: 'Chat > Viewer Cards >> Session Logs',
				title: 'Expand the session logs by default.',
				component: 'setting-check-box'
			}
		});

		this.settings.add('chat.viewer-cards.session-logs.show-username', {
			default: true,
			ui: {
				path: 'Chat > Viewer Cards >> Session Logs',
				title: 'Show the username and badges on each line, like chat.',
				description: 'Displays the user\'s badges and their name (in their chat color) before each message, so the logs read like normal chat.',
				component: 'setting-check-box'
			}
		});

		this.settings.add('chat.viewer-cards.session-logs.hide-if-mod', {
			default: true,
			ui: {
				path: 'Chat > Viewer Cards >> Session Logs',
				title: 'Hide session logs when you are a moderator of the channel.',
				description: 'Moderators already get Twitch\'s built-in mod logs in the viewer card, so the session logs are hidden to avoid duplication.',
				component: 'setting-check-box'
			}
		});

		this.ViewerCard = this.fine.define(
			'chat-viewer-card',
			n => n.props?.targetLogin && n.props?.hideViewerCard
		);
	}

	onEnable() {
		this.chat.context.on('changed:chat.viewer-cards.highlight-chat', this.refreshStyle, this);
		this.chat.context.on('changed:chat.viewer-cards.color', this.refreshStyle, this);
		this.on('..:update-colors', this.refreshStyle, this);

		this.css_tweaks.set('viewer-card-session-logs', SESSION_LOGS_CSS);
		this.on('chat:receive-message', this.onReceiveMessage, this);

		this.ViewerCard.ready((cls, instances) => {
			for (const inst of instances) {
				this.updateCard(inst);
			}
		});
		this.ViewerCard.on('mount', this.updateCard, this);
		this.ViewerCard.on('update', this.updateCard, this);
		this.ViewerCard.on('unmount', this.unmountCard, this);

		this.wrapViewerCard();
	}

	// ========================================================================
	// Session Logs
	// ========================================================================

	onReceiveMessage(event) {
		const msg = event && event.message,
			user = msg && msg.user,
			login = user && user.login;

		if ( ! login )
			return;

		// Clear logs whenever the active channel changes (switching streams).
		const room = event.channelID || event.channel || null;
		if ( room !== this.current_room_id ) {
			this.session_logs.clear();
			this.current_room_id = room;
		}

		if ( ! this.chat.context.get('chat.viewer-cards.session-logs') )
			return;

		const key = login.toLowerCase();
		let arr = this.session_logs.get(key);
		if ( ! arr ) {
			arr = [];
			this.session_logs.set(key, arr);
		}

		arr.push({
			id: msg.id || `${msg.timestamp || 0}-${arr.length}`,
			ts: msg.timestamp || Date.now(),
			tokens: msg.ffz_tokens,
			text: msg.message,
			deleted: !! msg.deleted,
			// Kept so each line can be rendered like chat: badges + colored name.
			user: msg.user,
			badges: msg.badges,
			ffz_badges: msg.ffz_badges,
			badgeDynamicData: msg.badgeDynamicData,
			roomID: msg.roomID,
			roomLogin: msg.roomLogin,
			sourceRoomID: msg.sourceRoomID
		});

		if ( arr.length > this.LOG_LIMIT )
			arr.splice(0, arr.length - this.LOG_LIMIT);

		// If a card is open for this user, re-render it so new lines show live.
		if ( this.last_login === key && this.ViewerCard )
			this.ViewerCard.forceUpdate();
	}

	getSessionLogs(login) {
		return this.session_logs.get((login || '').toLowerCase()) || [];
	}

	async wrapViewerCard() {
		const React = await this.site.findReact();
		if ( ! React )
			return;

		const t = this,
			e = React.createElement;

		const formatTime = ts => {
			const d = new Date(ts);
			return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
		};

		const processColor = raw => {
			if ( ! raw )
				return null;
			try {
				const colors = t.parent && t.parent.colors;
				return colors ? colors.process(raw) : raw;
			} catch(err) {
				return raw;
			}
		};

		const renderLine = (log, idx, show_user) => {
			const content = [];

			if ( show_user ) {
				const badges = (log.badges || log.ffz_badges)
					? t.chat.badges.render(log, e, false, true)
					: null;
				if ( badges && badges.length )
					content.push(e('span', {key: 'badges', className: 'ffz--vc-logs__badges'}, badges));

				content.push(e('span', {
					key: 'user',
					className: 'ffz--vc-logs__user',
					style: {color: processColor(log.user && log.user.color)}
				}, (log.user && (log.user.displayName || log.user.login)) || ''));
				content.push(e('span', {key: 'colon', className: 'ffz--vc-logs__colon'}, ': '));
			}

			content.push(e('span', {key: 'msg', className: 'ffz--vc-logs__msg'},
				log.tokens ? t.chat.renderTokens(log.tokens, e) : log.text));

			return e('div', {
				key: log.id || idx,
				className: `ffz--vc-logs__line${log.deleted ? ' ffz--vc-logs__line--deleted' : ''}`
			}, [
				e('span', {key: 'time', className: 'ffz--vc-logs__time'}, formatTime(log.ts)),
				e('span', {key: 'content', className: 'ffz--vc-logs__content'}, content)
			]);
		};

		const SessionLogs = props => {
			const login = props.login,
				logs = t.getSessionLogs(login),
				show_user = !! t.chat.context.get('chat.viewer-cards.session-logs.show-username'),
				[open, setOpen] = React.useState(() => !! t.chat.context.get('chat.viewer-cards.session-logs.start-open'));

			return e('div', {className: `ffz--vc-logs${open ? ' ffz--vc-logs--open' : ''}`}, [
				e('button', {
					key: 'toggle',
					type: 'button',
					className: 'ffz--vc-logs__toggle',
					onClick: () => setOpen(o => ! o)
				}, [
					e('span', {key: 'arrow', className: 'ffz--vc-logs__arrow'}),
					e('span', {key: 'title', className: 'ffz--vc-logs__title'}, 'Session Logs'),
					e('span', {key: 'count', className: 'ffz--vc-logs__count'}, String(logs.length))
				]),
				open
					? e('div', {key: 'body', className: 'ffz--vc-logs__body'},
						logs.length
							? logs.map((log, idx) => renderLine(log, idx, show_user))
							: e('div', {className: 'ffz--vc-logs__empty'}, 'No messages from this user yet this session.')
					)
					: null
			]);
		};

		this.ViewerCard.ready(cls => {
			if ( cls.prototype.__ffz_logs_wrapped )
				return;
			cls.prototype.__ffz_logs_wrapped = true;

			const old_render = cls.prototype.render;
			cls.prototype.render = function() {
				const out = old_render.call(this);
				try {
					if ( ! out || ! React.isValidElement(out) || ! t.chat.context.get('chat.viewer-cards.session-logs') )
						return out;

					// Moderators already have Twitch's built-in mod logs here.
					if ( t.chat.context.get('chat.viewer-cards.session-logs.hide-if-mod') && t.site.getUser()?.moderator )
						return out;

					const login = (this.props && this.props.targetLogin || '').toLowerCase();
					if ( ! login )
						return out;

					const kids = React.Children.toArray(out.props && out.props.children);
					kids.push(e(SessionLogs, {key: 'ffz-session-logs', login}));
					return React.cloneElement(out, null, kids);

				} catch(err) {
					t.log.error('[session-logs] error rendering viewer card', err);
					return out;
				}
			};

			this.ViewerCard.forceUpdate();
		});
	}

	// ========================================================================
	// Highlighting
	// ========================================================================

	refreshStyle() {
		this.updateStyle(this.last_login);
	}

	updateStyle(login) {
		// Make sure we're dealing with lower-case logins.
		if ( typeof login === 'string' )
			login = login.toLowerCase();

		this.last_login = login;
		if ( login && this.chat.context.get('chat.viewer-cards.highlight-chat') ) {
			let color = this.chat.context.get('chat.viewer-cards.color');
			if ( color && color.length )
				color = this.parent.inverse_colors.process(color);
			else if ( this.chat.context.get('theme.is-dark') )
				color = 'rgba(0,80,255,0.2)';
			else
				color = 'rgba(128,170,255,0.2)';

			this.css_tweaks.set('viewer-card-highlight', `
body .chat-room .chat-scrollable-area__message-container > div:nth-child(1n+0) > .chat-line__message:not(.chat-line--inline):not(.something-nonexistent)[data-user="${login}"],
body .chat-room .chat-scrollable-area__message-container > div:nth-child(1n+0) > div > .chat-line__message:not(.chat-line--inline):not(.something-nonexistent)[data-user="${login}"],
body .chat-room .chat-line__message:not(.chat-line--inline):nth-child(1n+0)[data-user="${login}"] {
	background-color: ${color} !important;
}`);
		} else
			this.css_tweaks.delete('viewer-card-highlight');
	}

	updateCard(inst) {
		this.updateStyle(inst.props && inst.props.targetLogin);
	}

	unmountCard() {
		this.updateStyle();
	}
}
