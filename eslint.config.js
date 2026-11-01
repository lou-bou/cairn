import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // No floats for money (spec §4, AC 12): parse with parseAmount/parseRate, format with formatMoney.
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Use parseAmount/parseRate from @cairn/shared.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Number',
          property: 'parseFloat',
          message: 'Use parseAmount/parseRate from @cairn/shared.',
        },
        { property: 'toFixed', message: 'Use formatMoney/formatAmountInput from @cairn/shared.' },
      ],
    },
  },
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', 'scripts/**/*.mjs', '*.js', '*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Components read colors from theme tokens only (spec §14, AC 13).
    files: ['web/src/**/*.{ts,tsx}'],
    ignores: ['web/src/themes/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^(#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()/]',
          message: 'Use a theme token (var(--color-…)) instead of a raw color.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{6}\\b|rgba?\\(/]',
          message: 'Use a theme token (var(--color-…)) instead of a raw color.',
        },
      ],
    },
  },
);
