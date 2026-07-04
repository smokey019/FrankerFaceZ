'use strict';

// ============================================================================
// Swap Sides Button
// Per-tab toggle for swapping chat and navigation to the other side.
// ============================================================================

import Module from 'utilities/module';
import {createElement} from 'utilities/dom';

const STORAGE_KEY = 'ffz-flip-sidebars';

export default class SwapSides extends Module {
	constructor(...args) {
		super(...args);

		this.should_enable = true;

		this.inject('i18n');
		this.inject('settings');
		this.inject('site.elemental');

		this.flip = this.flip.bind(this);

		this.settings.add('layout.swap-sidebars-button', {
			default: true,
			ui: {
				path: 'Appearance > Layout >> Side Navigation',
				title: 'Add a button to the top of chat for swapping sidebars in the current tab.',
				description: 'This swaps navigation and chat to the opposite sides of the window, like Swap Sidebars, but only for the current tab. Each tab remembers its own state for as long as it remains open.',
				component: 'setting-check-box'
			},
			changed: () => this.updateButtons()
		});

		this.ChatToggle = this.elemental.define(
			'chat-toggle-visibility', '.right-column__toggle-visibility',
			null,
			{attributes: true}, 1, 0
		);
	}

	onEnable() {
		let flipped = false;
		try {
			flipped = sessionStorage.getItem(STORAGE_KEY) === '1';
		} catch(err) { /* no-op */ }

		if ( flipped )
			this.settings.updateContext({flip_sidebars: true});

		this.settings.getChanges('layout.swap-sidebars', () => this.updateButtons());

		this.ChatToggle.on('mount', this.updateButton, this);
		this.ChatToggle.on('mutate', this.updateButton, this);
		this.ChatToggle.each(el => this.updateButton(el));
	}

	get flipped() {
		return !! this.settings.get('context.flip_sidebars');
	}

	flip() {
		const val = ! this.flipped;
		this.settings.updateContext({flip_sidebars: val});

		try {
			if ( val )
				sessionStorage.setItem(STORAGE_KEY, '1');
			else
				sessionStorage.removeItem(STORAGE_KEY);
		} catch(err) { /* no-op */ }
	}

	updateButtons() {
		this.ChatToggle.each(el => this.updateButton(el));
	}

	updateButton(el) {
		let cont = el.querySelector('.ffz--swap-sides');
		if ( ! this.settings.get('layout.swap-sidebars-button') ) {
			if ( cont )
				cont.remove();
			return;
		}

		let btn, tip;
		if ( ! cont ) {
			cont = (<div class="ffz--swap-sides tw-relative ffz-il-tooltip__container">
				{btn = (<button
					class="tw-align-items-center tw-align-middle tw-border-bottom-left-radius-medium tw-border-bottom-right-radius-medium tw-border-top-left-radius-medium tw-border-top-right-radius-medium tw-button-icon ffz-core-button tw-inline-flex tw-interactive tw-justify-content-center tw-overflow-hidden tw-relative"
					type="button"
					data-a-target="ffz-swap-sides-button"
					onClick={this.flip}
				>
					<div class="tw-align-items-center tw-flex tw-flex-grow-0">
						<div class="tw-button-icon__icon">
							<figure class="ffz-i-arrows-cw" />
						</div>
					</div>
				</button>)}
				<div class="ffz-il-tooltip ffz-il-tooltip--align-left ffz-il-tooltip--down" role="tooltip">
					{tip = (<div />)}
				</div>
			</div>);

			el.appendChild(cont);

		} else {
			btn = cont.querySelector('button');
			tip = cont.querySelector('.ffz-il-tooltip > div');
		}

		const label = this.flipped
			? this.i18n.t('swap-sides.button.restore', 'Unswap Sides (this tab)')
			: this.i18n.t('swap-sides.button.swap', 'Swap Sides (this tab)');

		btn.setAttribute('aria-label', label);
		tip.textContent = label;
	}
}
