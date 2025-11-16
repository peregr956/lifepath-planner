# UI Web (Next.js 15)

Front-end for the AI budget assistant experience. This app runs on Next.js 15 with the App Router, TypeScript, Tailwind CSS, and modern developer tooling that mirrors the rest of the repo.

## Stack & Tooling

- Next.js 15 (App Router + `src/` directory)
- React 18 with strict mode + typed routes enabled
- Tailwind CSS + PostCSS for styling
- ESLint (Next core web vitals, Testing Library, Jest-DOM) + Prettier (with tailwind plugin)
- Vitest + Testing Library + jsdom for unit/component tests
- Shared TypeScript path aliases via `tsconfig.json` (`@/*` → `src/*`)

## Getting Started

```bash
cd services/ui-web
npm install
npm run dev
```

Visit http://localhost:3000 to load the UI.

### Package Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server with hot reload |
| `npm run build` | Create a production build (`.next/`) |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint (Next.js integration) |
| `npm run type-check` | Execute TypeScript in `--noEmit` mode |
| `npm run test` | Run Vitest in CI-friendly mode |
| `npm run test:watch` | Watch mode for Vitest |
| `npm run format` | Check formatting via Prettier |
| `npm run format:write` | Auto-format the repo |

## Testing

- Unit/component tests live in `src/**/__tests__` and use Vitest + Testing Library.
- Global DOM matchers are provided via `src/test/setup.ts`.
- Example: `npm run test` (CI) or `npm run test:watch` (local dev).

## Styling

Tailwind is configured with:

- `tailwind.config.ts` – content scan limited to `src/**/*.{ts,tsx}`
- `postcss.config.cjs` – Tailwind + Autoprefixer
- Global layer defined in `src/app/globals.css`

Use utility classes directly or compose via `@apply` helpers such as the shared `.card` style.

## Project Layout

```
services/ui-web/
├── src/
│   ├── app/              # App Router entrypoints (layout, page, global css)
│   ├── components/       # UI building blocks (forms, lists, upload, summary)
│   ├── test/             # Vitest setup files
│   ├── types/            # Shared TypeScript contracts
│   └── utils/            # Mock API clients & helpers
├── public/               # Static assets
├── tsconfig.json         # Strict TS config with `@/*` alias
├── vitest.config.ts      # Vitest + React plugin + path aliases
└── tailwind.config.ts    # Tailwind theme/content configuration
```

## Notes

- The mock API client (`src/utils/apiClient.ts`) simulates the backend services so the UI can be demoed end-to-end without touching other packages.
- ESLint’s `@next/next/no-html-link-for-pages` rule is disabled because this package uses the App Router exclusively (no `pages/` directory).