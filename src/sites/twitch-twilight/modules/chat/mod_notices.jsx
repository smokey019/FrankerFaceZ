'use strict';

import Module from 'utilities/module';
import { durationForChat } from 'utilities/time';

// ============================================================================
// Moderation Notices
// ============================================================================
// Twitch only surfaces timeout / ban / delete events to moderators. Chat still
// receives the underlying CLEARCHAT / CLEARMSG for everyone, which FFZ turns
// into a `chat:mod-user` event — so we can show a notice line to non-moderators
// too. Moderators are skipped, since Twitch already shows them the native line
// (this avoids double-posting).

export default class ModNotices extends Module {
	constructor(...args) {
		super(...args);

		this.inject('settings');
		this.inject('chat');
		this.inject('site');

		// Short-lived de-dupe so a re-processed event can't post twice.
		this.recent = new Map();

		this.settings.add('chat.show-mod-notices', {
			default: true,
			ui: {
				path: 'Chat > Filtering >> Moderation',
				title: 'Show timeout, ban, and delete notices when you are not a moderator.',
				description: 'Twitch normally only shows moderation events to moderators. This adds a chat notice (such as "username has been timed out for 10m.") for everyone else. Moderators are skipped so the notice is not shown twice.',
				component: 'setting-check-box'
			}
		});
	}

	onEnable() {
		this.on('chat:mod-user', this.onModUser, this);
	}

	getAction(mod_type) {
		const types = this.parent.mod_types || {};
		if ( mod_type === types.Ban )
			return 'ban';
		if ( mod_type === types.Timeout )
			return 'timeout';
		if ( mod_type === types.Delete )
			return 'delete';
		return null;
	}

	getNoticeText(action, target, msg) {
		if ( action === 'ban' )
			return `${target} has been permanently banned.`;
		if ( action === 'timeout' )
			return `${target} has been timed out${msg && msg.duration ? ` for ${durationForChat(msg.duration)}` : ''}.`;
		if ( action === 'delete' )
			return `A message from ${target} was deleted.`;
		return null;
	}

	onModUser(mod_type, target, target_message_id, msg) {
		if ( ! target || ! this.chat.context.get('chat.show-mod-notices') )
			return;

		const action = this.getAction(mod_type);
		if ( ! action )
			return;

		// De-dupe identical events seen within a short window.
		const now = Date.now(),
			key = `${mod_type}|${target}|${target_message_id || ''}|${(msg && msg.duration) || ''}`;

		for ( const [k, ts] of this.recent )
			if ( now - ts > 2000 )
				this.recent.delete(k);

		if ( this.recent.has(key) )
			return;
		this.recent.set(key, now);

		// Find the chat instance for this channel, so we can (a) check whether
		// we're a moderator there (mods already see Twitch's native line) and
		// (b) target the notice at the right channel.
		const room = msg && msg.channel ? msg.channel.replace(/^#/, '').toLowerCase() : null,
			instances = Array.from(this.parent.ChatService?.instances || []);

		let inst = null;
		if ( room )
			inst = instances.find(i => i.props?.channelLogin?.toLowerCase() === room);
		else if ( instances.length === 1 )
			inst = instances[0];

		if ( inst?.props?.isCurrentUserModerator )
			return;

		// If we couldn't pin down the channel but we're a moderator somewhere,
		// skip rather than risk posting into the wrong chat.
		if ( ! inst && this.site.getUser()?.moderator )
			return;

		const text = this.getNoticeText(action, target, msg);
		if ( ! text )
			return;

		const target_room = inst?.props?.channelLogin || room || '*';

		// Defer so we don't add to the buffer while a message is mid-process.
		setTimeout(() => this.parent.addNotice(target_room, text), 0);
	}
}
