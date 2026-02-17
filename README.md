# Sports Academy Management Platform

Player portals, coach tools, and admin dashboards — all in one place.

## Tech Stack

| Layer | Technology | Service |
|-------|-----------|---------|
| Frontend + Backend | Next.js 15 (App Router) | Vercel |
| Database | PostgreSQL | Supabase |
| Auth | Supabase Auth | Supabase |
| File Storage | Supabase Storage | Supabase |
| Job Queue | BullMQ + Redis | Railway |

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/sports-academy.git
cd sports-academy
npm install
```

### 2. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Copy `.env.local.example` → `.env.local` and fill in your keys:
   - `NEXT_PUBLIC_SUPABASE_URL` → Settings → API → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Settings → API → anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` → Settings → API → service_role key

### 3. Run Migration

Option A — via Supabase Dashboard:
- Go to SQL Editor → paste contents of `supabase/migrations/20260218000000_phase1_foundation.sql` → Run

Option B — via Supabase CLI:
```bash
npx supabase link --project-ref YOUR_PROJECT_ID
npx supabase db push
```

### 4. Run Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── _auth/            # Shared auth actions (server actions)
│   ├── login/            # Login page
│   ├── register/         # Registration page
│   ├── player/           # Player portal routes
│   │   └── dashboard/
│   ├── admin/            # Admin portal routes
│   │   └── dashboard/
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Landing page
│   └── globals.css
├── components/
│   ├── ui/               # Reusable UI components
│   ├── layout/           # Sidebar, header, nav
│   └── forms/            # Form components
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Browser client
│   │   └── server.ts     # Server client
│   └── utils/
│       └── cn.ts         # Class name utility
├── types/
│   └── database.ts       # Supabase typed schema
└── middleware.ts          # Auth + role-based route protection
```

## Roles & Access

| Route | Player | Coach | Admin |
|-------|--------|-------|-------|
| `/player/*` | ✅ | ❌ | ✅ |
| `/coach/*` | ❌ | ✅ | ✅ |
| `/admin/*` | ❌ | ❌ | ✅ |

## Phase Roadmap

- **Phase 1** — Foundation & Player Experience (current)
- **Phase 2** — Training Operations & Communication
- **Phase 3** — Reports, Polish & Launch
