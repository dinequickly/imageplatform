# SubjectFocus

Minimal Vite + React app wired to Supabase with Tailwind and React Router.

## Env Vars
Frontend (Vite):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Backend (serverless chat):
- `OPENAI_API_KEY` (required)
- `OPENAI_ASSISTANT_MODEL` (optional; defaults to `gpt-4.1-mini`)

Create `.env.local` in project root for Vite. For serverless in local dev, use `netlify dev` or `vercel dev` with env vars set.

## Run (Vite only)
```
npm install
npm run dev
```

## Run with Chat (Netlify)
```
# set envs for functions
netlify dev --env OPENAI_API_KEY=sk-...
```
This serves frontend and maps `/api/chat` to `/.netlify/functions/chat`.

## Run with Chat (Vercel)
```
vercel dev
```
This serves `/api/chat` from `api/chat/index.js`.

## Build
```
npm run build
```

## Pages
- `/login`, `/signup`
- `/` (dashboard)
- `/study-set/new` (create set + inline cards)
- `/study-set/:id` (detail + right sidebar actions + AI chat)
