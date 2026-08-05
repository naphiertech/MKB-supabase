# MKBRiderTrack Landing Site

The landing application is the public website for MKBRiderTrack. It explains the system, presents its operational modules and service locations, introduces the team, links authorized users to the dashboard, and accepts reviews for moderation.

This application is separate from the authenticated dashboard. It must not contain Admin, HR, Payroll, or Rider operational workflows.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Hero, system story, capabilities, locations, testimonials, and call to action |
| `/about` | System background, timeline, and operating principles |
| `/modules` | Overview of the platform modules |
| `/locations` | Available geofence and service-location summaries |
| `/locations/[slug]` | Detailed location page |
| `/team` | Core team information |
| `/contact` | Contact information and inquiry content |
| `/api/reviews` | GET approved reviews and POST new reviews for moderation |

## Technology

- Next.js 16 App Router
- React 19 and TypeScript
- Tailwind CSS 4
- Radix UI primitives
- GSAP, Framer Motion, and Lenis for motion and scrolling
- Supabase JS for review storage
- Cloudflare Turnstile for review-submission protection
- Vercel Analytics

## Structure

```text
landing/
|-- app/
|   |-- api/reviews/route.ts   Moderated reviews endpoint
|   |-- locations/[slug]/      Dynamic location details
|   |-- about/                 About page
|   |-- contact/               Contact page
|   |-- modules/               Modules page
|   |-- team/                  Team page
|   |-- layout.tsx             Shared metadata and site shell
|   `-- page.tsx               Home page composition
|-- components/
|   |-- animations/            Shared motion behavior
|   |-- home/                  Home-page sections
|   |-- locations/             Location presentation
|   |-- team/                  Team presentation
|   `-- ui/                    Shared UI primitives
|-- hooks/                     Reusable client hooks
|-- lib/
|   |-- data.ts                Site metadata and content collections
|   `-- utils.ts               Shared utilities
`-- package.json
```

## Environment variables

Create `landing/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:5173
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-turnstile-site-key
TURNSTILE_SECRET_KEY=your-turnstile-secret-key
```

| Variable | Required for | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Loading and submitting reviews | Browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Loading and submitting reviews | Browser and server |
| `NEXT_PUBLIC_DASHBOARD_URL` | Access Portal links | Browser |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Review captcha widget | Browser |
| `TURNSTILE_SECRET_KEY` | Server-side captcha verification | Server only |

The source includes Cloudflare test-key fallbacks for local development. Production must provide real Turnstile keys. Never expose a Supabase service-role key or the Turnstile secret through a `NEXT_PUBLIC_` variable.

## Development

Use Node.js 20 or newer and pnpm 10:

```bash
pnpm install
pnpm dev
```

The site runs at `http://localhost:3000` by default. The dashboard link falls back to `http://localhost:5173` when `NEXT_PUBLIC_DASHBOARD_URL` is not set.

## Verification

```bash
pnpm run typecheck
pnpm run build
```

To inspect a production build locally:

```bash
pnpm start
```

The root workspace also exposes `npm run dev:landing`, `npm run typecheck`, and `npm run build`.

## Reviews flow

1. The visitor submits a name, rating, comment, optional role title, and Turnstile token.
2. `POST /api/reviews` validates required data and verifies the token with Cloudflare.
3. The review is inserted into Supabase with `status: pending`.
4. Admin or HR users moderate the review in the dashboard.
5. `GET /api/reviews` returns only approved reviews for public display.

Supabase RLS must allow only the intended anonymous review operations. Moderation permissions belong to the authenticated dashboard roles.

## Content and design conventions

- Keep shared business and location copy in `lib/data.ts` when possible.
- Reuse components from `components/ui/` and the existing animation wrappers.
- Preserve responsive behavior and reduced-motion accessibility when adding effects.
- Keep operational data and authenticated actions in the dashboard.
- Update metadata when adding a public page.

## Deployment

Provide all production environment variables in the hosting platform, then run:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

Confirm that Access Portal links point to the deployed dashboard and that review submission, moderation, and approved-review retrieval work with the production RLS policies.
