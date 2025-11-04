# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SubjectFocus is a study application built with Vite + React + Supabase. It enables students to create flashcard study sets with AI-powered assistance from OpenAI. The app features authentication, study set management, AI flashcard generation, spaced repetition learning, study guides, and interactive podcasts.

## Development Commands

### Frontend Development
```bash
npm install           # Install dependencies
npm run dev           # Run Vite dev server (port 5173)
npm run build         # Build for production
npm run preview       # Preview production build (port 4173)
```

### With Serverless Functions (AI Chat)

**Netlify:**
```bash
netlify dev --env OPENAI_API_KEY=sk-...
```
Serves frontend + maps `/api/chat` to `/.netlify/functions/chat`

**Vercel:**
```bash
vercel dev
```
Serves `/api/chat` from `api/chat/index.js`

### Supabase Local Development
```bash
supabase start                                    # Start local Supabase stack
supabase db reset                                 # Reapply migrations and seeds
supabase db diff --linked --schema public        # Generate migration from remote changes
supabase migration new "short-description"       # Create new migration file
supabase db lint                                  # Check for invalid references
```

## Architecture

### Frontend Structure
- **Router:** React Router v6 with protected routes
- **Auth:** Supabase Auth with session persistence via `useAuth` hook
- **State:** React hooks (no global state management)
- **Styling:** Tailwind CSS
- **Rich Text:** TipTap editor for study guides

### Key Routes
- `/login`, `/signup` - Authentication
- `/` - Dashboard (lists user's study sets)
- `/study-set/new` - Create new study set with inline card creation
- `/study-set/:id` - Study set detail page with right sidebar AI chat
- `/study-set/:id/practice` - Practice mode for flashcards
- `/study-set/:id/guides` - Study guides list for a study set
- `/study-set/:id/guides/:guideId` - View study guide
- `/study-set/:id/guides/:guideId/edit` - Edit study guide with TipTap editor
- `/study-set/:id/podcasts` - Podcasts list for a study set
- `/study-set/:id/podcasts/create` - Create new podcast
- `/study-set/:id/podcasts/:podcastId` - Podcast player

### Components
- `ProtectedRoute` - Wraps authenticated routes, redirects to `/login`
- `NavBar` - Top navigation with user menu
- `AIChatPanel` - Right sidebar for AI flashcard generation (mode: 'flashcard')
- `StudyGuideAIPanel` - Right sidebar for AI study guide generation (mode: 'study_guide')

### Backend Architecture
The app uses **serverless functions** deployed on Netlify OR Vercel (not both) to handle AI requests:

1. **Dual function implementations:**
   - `netlify/functions/chat.js` - Netlify Functions handler
   - `api/chat/index.js` - Vercel Functions handler
   - Both call the shared logic in `server/openaiChat.js`

2. **AI Chat Flow (`server/openaiChat.js`):**
   - Receives messages, context, temperature, user_id, and optional maxTokens
   - Context object can include `mode: 'study_guide'` or default to flashcard mode
   - **Flashcard mode:**
     - Formats system prompt with study set context (title, subject, existing cards)
     - Calls OpenAI API with structured JSON schema: `{ message, flashcards: [{ term, definition }] }`
     - **Auto-saves flashcards:** If `SUPABASE_SERVICE_ROLE_KEY` is set, function directly inserts flashcards into `public.flashcards` table using service role client
     - Returns: `{ message, flashcards }` where flashcards include success/error status
   - **Study guide mode:**
     - Uses `STUDY_GUIDE_SYSTEM_PROMPT` with current guide content in context
     - Enforces strict JSON schema: `{ message, content }` where content is HTML
     - Content field has minLength: 200 and is required
     - Returns HTML-formatted study guide sections to be inserted into TipTap editor

3. **Frontend AI Panels:**
   - `AIChatPanel` (flashcards):
     - Sends POST to `/api/chat` with messages array and context object
     - Context includes: `study_set_id`, `title`, `subject`, `description`, `cards` (last 10)
     - Receives flashcards that may already be persisted (check for `id` field)
   - `StudyGuideAIPanel` (study guides):
     - Sends POST to `/api/chat` with context.mode = 'study_guide'
     - Context includes: `study_set_id`, `title`, `subject`, `currentContent` (truncated to 15000 chars)
     - Receives HTML content to insert into the TipTap editor

### Database Schema (Supabase)

**Key Tables:**
- `user_profiles` - User metadata (linked to auth.users)
- `study_sets` - Study sets owned by users
  - Has `total_cards` auto-maintained by trigger
  - Tracks `subject_area`, `color_theme`, `is_public`
- `flashcards` - Cards within study sets
  - Fields: `question`, `answer`, `hint`, `explanation`, `difficulty_level`, `starred`
  - Soft delete via `deleted_at`
  - Trigger updates parent `study_sets.total_cards` on insert/delete
- `flashcard_progress` - Spaced repetition tracking per user/card
  - Fields: `times_seen`, `times_correct`, `next_review_date`, `mastery_level`
- `learning_sessions` - Session history with metrics
- `generated_content` - AI-generated content (study guides, quizzes, podcasts, etc.)
  - `content_type` enum: 'podcast', 'video', 'newsletter', 'study_guide', 'practice_test', 'brief', 'mindmap', 'quiz', 'flashcard_set'
  - `status` enum: 'pending', 'generating', 'completed', 'failed'
- `podcasts` - Podcast episodes (separate from generated_content)
  - Fields: `study_set_id`, `user_id`, `title`, `type`, `duration_minutes`, `user_goal`, `status`, `audio_url`, `script`
  - Status values: 'generating', 'completed', 'failed'
  - Type values determine podcast format (pre-recorded, live-interactive, etc.)
- `calendar_events` - Study schedule events
- `tags`, `study_set_tags` - Tagging system
- `study_set_collaborators` - Sharing with role-based access
- `canvas_integrations`, `canvas_courses` - Canvas LMS integration

**Important Views:**
- `cards_due_for_review` - Joins flashcards + progress where `next_review_date <= now()`
- `study_set_overview` - Aggregated metrics per study set

**RLS (Row Level Security):**
- All user data tables enforce RLS
- Users can only access their own data OR public/shared study sets
- Collaborators can access based on role (viewer/editor)
- Service role bypasses RLS for AI function writes

**Naming Conventions:**
- Tables/columns: `snake_case`
- Functions/triggers: verb-based (e.g., `update_study_set_card_count`)

## Environment Variables

### Frontend (Vite)
```bash
VITE_SUPABASE_URL=          # Supabase project URL
VITE_SUPABASE_ANON_KEY=     # Supabase anon/public key
```

### Backend (Serverless Functions)
```bash
OPENAI_API_KEY=                    # Required for AI chat
OPENAI_ASSISTANT_MODEL=            # Optional (defaults to gpt-5-mini)
SUPABASE_URL=                      # Required for auto-saving flashcards
SUPABASE_SERVICE_ROLE_KEY=         # Required for auto-saving (bypasses RLS)
```

Store frontend vars in `.env.local` at project root. For serverless, use platform-specific env config (Netlify/Vercel dashboard).

## Key Features & Implementation Notes

### AI Flashcard Generation
- Structured JSON schema enforces `{ message, flashcards: [{ term, definition }] }` format
- System prompt includes context about existing cards to avoid duplicates
- Server-side persistence: flashcards are auto-inserted into DB by serverless function
- Frontend should check if flashcards have `id` field (already saved) vs `error` field (save failed)

### AI Study Guide Generation
- Uses same `/api/chat` endpoint with `context.mode = 'study_guide'`
- Strict JSON schema enforces `{ message, content }` where content is HTML (min 200 chars)
- Context includes `currentContent` (last 15000 chars of existing guide)
- Model returns HTML that gets inserted into TipTap editor
- Study guides are stored separately in database (exact table TBD from schema)

### Spaced Repetition (Minimal Implementation)
- Review flow fetches from `cards_due_for_review` view
- On review: update `flashcard_progress` with results
- Simple scheduling: correct → +1 day, incorrect → +10 minutes
- Tracks: `mastery_level` (new/learning/reviewing/mastered), `interval_days`, `repetitions`

### Podcasts
- Users create podcasts linked to study sets
- Podcast creation flow: CreatePodcast → insert into `podcasts` table with status='generating' → navigate to PodcastPlayer
- PodcastPlayer polls for status updates every 3 seconds while status='generating'
- Podcasts support different types (pre-recorded, live-interactive, etc.)
- Script is stored as structured data in the `script` field

### Database Triggers
- `update_study_set_card_count()` - Maintains `total_cards` count when flashcards inserted/deleted
- `update_updated_at_column()` - Auto-updates `updated_at` timestamp

## Deployment

### Netlify
- Build: `npm run build` → `dist/`
- Functions: `netlify/functions/` auto-detected
- Redirects: `netlify.toml` handles SPA routing + `/api/chat` → `/.netlify/functions/chat`
- Set env vars in Netlify dashboard

### Vercel
- Build: `npm run build` → `dist/`
- Functions: `api/` directory auto-detected
- Rewrites: `vercel.json` handles SPA routing
- Set env vars in Vercel dashboard

**Auth Redirect URLs:** Configure in Supabase dashboard for deployed domains

## Supabase Migrations

### Migration Workflow
1. Make schema changes locally or pull from linked project
2. Run `supabase db diff --linked --schema public` to generate migration
3. Review and clean up generated SQL before committing
4. Test with `supabase db reset` to verify clean-state reproducibility
5. Commit only reviewed migrations (delete scratch files)

### Migration Files
- `supabase/migrations/00000000000000_initial_schema.sql` - Empty placeholder
- `supabase/migrations/initial_schema.sql` - Actual base schema (1223 lines)
- `supabase/migrations/` - Timestamped migration files
- Use `supabase migration new "description"` to scaffold new migrations

### Best Practices
- Keep migrations idempotent (use `IF NOT EXISTS`, `OR REPLACE`)
- Include `COMMENT ON` statements for self-documenting schemas
- Add example queries as commented snippets in migrations
- Document required backfills or manual steps in PR descriptions

## Code Style

### SQL
- Use `snake_case` for all objects
- Functions/triggers should be verb-based
- Keep lines under 120 characters
- Prefer `NOW()` and `uuid_generate_v4()` over client-side defaults

### JavaScript/React
- Functional components with hooks
- Use Supabase client for all DB operations (RLS enforced)
- Handle common errors: 403 (RLS denied), 404 (not found)
- Keep components simple; no complex state management

## Testing

- Run `supabase db reset` to verify migrations
- Check schema in Supabase Studio or via `psql`
- Run `supabase db lint` before commits
- Test RLS policies by switching user contexts

## Git Workflow

### Commit Messages
- Imperative, present-tense (e.g., "Add Supabase schema")
- Keep subject under 50 characters
- Reference issues: `Closes #123`

### Pull Requests
- Summarize migration intent and expected data backfills
- Document manual steps required (env vars, `supabase db reset`)
- Include before/after notes for schema changes
- Attach ERD snapshots or query plans when clarifying impact

## Security Notes

- Never commit `.env` files or API keys
- Use `env(...)` indirection in `supabase/config.toml`
- New storage buckets/auth providers should default to disabled
- Service role key should only be used in serverless functions (never frontend)
- RLS policies protect all user data; verify policies when adding tables
