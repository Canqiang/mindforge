import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'examples/**', 'pnpm-lock.yaml']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'import-x': importX,
      'react-hooks': reactHooks
    },
    settings: {
      'import-x/resolver-next': [
        (await import('eslint-import-resolver-typescript')).createTypeScriptImportResolver({
          project: './tsconfig.json'
        })
      ]
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Module boundaries — the lint-time stand-in for monorepo package fences (see ADR-0005).
      'import-x/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/core',
            from: './src',
            except: ['./core'],
            message: 'src/core/ must not depend on other src/ modules'
          },
          {
            target: './src/layout',
            from: './src',
            except: ['./core', './layout'],
            message: 'src/layout/ may only import from src/core/'
          },
          {
            target: './src/render',
            from: './src',
            except: ['./core', './editor', './layout', './render'],
            message: 'src/render/ may only import from src/core/, src/editor/, and src/layout/'
          },
          {
            target: './src/outline',
            from: './src',
            except: ['./core', './editor', './outline'],
            message: 'src/outline/ may only import from src/core/ and src/editor/'
          },
          {
            target: './src/editor',
            from: './src',
            except: ['./core', './editor'],
            message: 'src/editor/ may only import from src/core/'
          },
          {
            target: './src/theme',
            from: './src',
            except: ['./theme'],
            message: 'src/theme/ must be leaf — it only exports tokens'
          },
          {
            target: './src/ai',
            from: './src',
            except: ['./core', './ai'],
            message: 'src/ai/ may only import from src/core/'
          },
          {
            target: './src/io',
            from: './src',
            except: ['./core', './io'],
            message: 'src/io/ may only import from src/core/'
          }
        ]
      }],

      // CoreStore must be the only consumer of zustand (see ADR-0004).
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['zustand', 'zustand/*'],
            message: 'Only src/core/ may import zustand. Other modules must use the CoreStore API.'
          }
        ]
      }],

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }]
    }
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      'no-restricted-imports': 'off',
      'import-x/no-restricted-paths': 'off'
    }
  }
);
