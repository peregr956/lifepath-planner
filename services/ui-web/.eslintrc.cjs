/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'plugin:testing-library/react',
    'plugin:jest-dom/recommended',
    'prettier',
  ],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  env: {
    browser: true,
    es2021: true,
  },
  settings: {
    next: {
      rootDir: ['src/*/'],
    },
  },
  rules: {
    'testing-library/render-result-naming-convention': 'off',
    '@next/next/no-html-link-for-pages': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
      env: {
        node: true,
      },
      globals: {
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
      },
    },
  ],
  ignorePatterns: ['node_modules/', '.next/', 'dist/'],
};
