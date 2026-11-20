import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Local-only rule: no eval or string-to-code paths.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // `const { dropped: _dropped, ...rest } = obj` is the idiomatic way to omit a field.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Local-only rule: never turn user text into markup.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render user text as text nodes (see src/text/MarkdownLite.tsx).',
        },
        {
          selector:
            'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
          message: 'Do not assign HTML strings; build DOM nodes or use Preact.',
        },
        {
          selector: 'CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]',
          message: 'Do not inject HTML strings.',
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
