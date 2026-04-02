# Peak Condo Storage — Construction Tracker

A real-time construction punch list and progress tracker for 172-unit condo storage build in Eagle, Idaho.

## Setup

### 1. Supabase database
Run `SUPABASE_SETUP.sql` in your Supabase SQL Editor (https://coweysmbbglshmtmxhsi.supabase.co).

### 2. Environment variables
Copy `.env.local.example` to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://coweysmbbglshmtmxhsi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_y-W8ugmFLvUFTCOo_CT_Hg_coCf3xa1
ANTHROPIC_API_KEY=your_key_here   ← get from console.anthropic.com
```

### 3. Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

### 4. Deploy to Vercel (recommended)
```bash
npx vercel
```
Add the 3 environment variables in Vercel dashboard → Settings → Environment Variables.
Share the Vercel URL with your second team member — that's it.

## Features
- Log issues with area, unit, trade, priority, description, photos
- AI recommendation on every issue (powered by Claude)
- Real-time sync — both users see updates instantly
- Filter by status / trade / priority
- AI project summary on the Overview tab
- Your name saves locally so it appears on your issues

## Stack
- Next.js 14 (App Router)
- Supabase (Postgres + real-time)
- Anthropic Claude API
- Deployed on Vercel
