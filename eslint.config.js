const js = require('@eslint/js');
const pluginVue = require('eslint-plugin-vue');
const react = require('eslint-plugin-react');
const { fixupPluginRules } = require('@eslint/compat');
const globals = require('globals');

module.exports = [
	// was: 'eslint:recommended'
	js.configs.recommended,

	// was: 'plugin:vue/recommended' — the Vue 2 preset. The flat Vue 2
	// preset is 'flat/vue2-recommended'; plain 'flat/recommended' is the
	// Vue 3 preset, do not use it here.
	...pluginVue.configs['flat/vue2-recommended'],

	{
		files: ['**/*.{js,jsx,vue}'],

		plugins: {
			// eslint-plugin-react 7.x uses APIs removed in ESLint 10
			// (context.getFilename); fixupPluginRules restores them.
			react: fixupPluginRules(react)
		},

		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: {
				ecmaFeatures: {
					jsx: true
				}
			},
			globals: {
				...globals.browser,
				'import': 'readonly',
				'require': 'readonly',
				'__webpack_hash__': 'readonly',
				'__git_commit__': 'readonly',
				'__version_major__': 'readonly',
				'__version_minor__': 'readonly',
				'__version_patch__': 'readonly',
				'__version_prerelease__': 'readonly',
				'__extension__': 'readonly',
				'FrankerFaceZ': 'readonly'
			}
		},

		linterOptions: {
			// ESLint 9+ reports unused eslint-disable comments by default;
			// keep the ESLint 8 behavior for now.
			reportUnusedDisableDirectives: 'off'
		},

		settings: {
			react: {
				pragma: 'createElement',
				// Explicit version skips filesystem-based auto-detection,
				// which crashes under ESLint 10.
				version: '18.3'
			}
		},

		rules: {
			'require-atomic-updates': 'off',
			'accessor-pairs': ['error'],
			'block-scoped-var': ['error'],
			'class-methods-use-this': ['error'],
			'for-direction': ['error'],
			'guard-for-in': ['warn'],
			'no-alert': ['error'],
			'no-await-in-loop': ['error'],
			'no-caller': ['error'],
			'no-catch-shadow': ['error'],
			'no-invalid-this': ['error'],
			'no-iterator': ['error'],
			'no-labels': ['error'],
			'no-lone-blocks': ['error'],
			'no-octal-escape': ['error'],
			'no-proto': ['warn'],
			'no-return-await': ['error'],
			'no-self-compare': ['error'],
			'no-sequences': ['error'],
			'no-shadow-restricted-names': ['error'],
			'no-template-curly-in-string': ['warn'],
			'no-throw-literal': ['error'],
			'no-undef-init': ['error'],
			'no-unmodified-loop-condition': ['error'],
			// ESLint 9 changed the default caughtErrors to 'all'; keep the
			// ESLint 8 behavior of ignoring unused catch parameters.
			'no-unused-vars': ['error', {'caughtErrors': 'none'}],
			'no-use-before-define': ['error', {
				'functions': false,
				'classes': false
			}],
			'no-useless-call': ['warn'],
			'no-useless-concat': ['warn'],
			'no-useless-return': ['warn'],
			'no-void': ['error'],
			'no-warning-comments': ['warn'],
			'no-with': ['error'],
			'radix': ['error'],
			'require-await': ['warn'],
			// 'valid-jsdoc' was removed in ESLint 9.
			'yoda': ['warn'],

			'arrow-body-style': ['warn', 'as-needed'],
			'arrow-parens': ['warn', 'as-needed'],
			'arrow-spacing': ['warn'],
			'generator-star-spacing': ['warn'],
			'no-duplicate-imports': ['error'],
			'no-useless-computed-key': ['error'],
			'no-useless-constructor': ['error'],
			'no-useless-rename': ['error'],
			'no-var': ['error'],
			'no-cond-assign': ['warn'],
			'object-shorthand': ['warn'],
			'prefer-arrow-callback': ['warn', {'allowUnboundThis': true}],
			'prefer-const': ['warn', {'ignoreReadBeforeAssign': true}],
			'prefer-rest-params': ['warn'],
			'prefer-spread': ['error'],
			'prefer-template': ['warn'],
			'rest-spread-spacing': ['error', 'never'],
			'yield-star-spacing': ['warn'],

			'indent': [
				'warn',
				'tab',
				{
					'SwitchCase': 1
				}
			],
			'linebreak-style': [
				'error',
				'unix'
			],
			'quotes': [
				'error',
				'single',
				{
					'avoidEscape': true,
					'allowTemplateLiterals': true
				}
			],

			'vue/html-indent': [
				'warn',
				'tab'
			],
			'vue/valid-template-root': 'off',
			'vue/max-attributes-per-line': 'off',
			'vue/require-prop-types': 'off',
			'vue/require-default-prop': 'off',
			'vue/html-closing-bracket-newline': [
				'error',
				{
					'singleline': 'never',
					'multiline': 'always'
				}
			],

			'jsx-quotes': ['error', 'prefer-double'],
			'react/jsx-boolean-value': 'error',
			'react/jsx-closing-bracket-location': ['error', 'line-aligned'],
			//'react/jsx-closing-tag-location': 'error' -- stupid rule that doesn't allow line-aligned
			'react/jsx-equals-spacing': 'error',
			'react/jsx-filename-extension': 'error',
			'react/jsx-first-prop-new-line': ['error', 'multiline-multiprop'],
			'react/jsx-indent': ['warn', 'tab'],
			'react/jsx-indent-props': ['warn', 'tab'],
			//'react/jsx-key': 'warn',
			'react/jsx-no-bind': 'error',
			'react/jsx-no-comment-textnodes': 'error',
			'react/jsx-no-duplicate-props': 'error',
			'react/jsx-no-target-blank': 'error',
			'react/jsx-sort-props': ['error', {
				'callbacksLast': true,
				'reservedFirst': true,
				'noSortAlphabetically': true
			}],
			'react/jsx-tag-spacing': ['error', {
				'beforeClosing': 'never'
			}],
			'react/jsx-uses-react': 'error',
			'react/jsx-wrap-multilines': 'error'
		}
	}
];
