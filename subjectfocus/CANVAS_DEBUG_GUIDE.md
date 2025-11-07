# Canvas Integration - Debug & Monitoring Guide

## Quick Start Monitoring Setup

### 1. Terminal Setup (3 terminals recommended)

```bash
# Terminal 1: Supabase (if using local)
supabase start
# Note the Studio URL (usually http://127.0.0.1:54323)

# Terminal 2: Dev Server
npm run dev
# Opens at http://localhost:5173

# Terminal 3: Database monitoring (optional)
watch -n 2 'psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT course_name, onboarding_status, vectorization_status, items_vectorized, total_items_to_vectorize FROM canvas_courses WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5;"'
```

### 2. Browser DevTools (F12)

Keep these tabs open:

#### **Console Tab** - Watch for these logs:
```
[CourseSelection] Firing webhook for course: <name> <id>
[CourseSelection] Webhook response: 200 OK
[CourseSelection] Webhook data: {...}

[CanvasSync] Starting course status polling
[CanvasSync] Polling for course updates...

[CourseOnboarding] Firing vectorize webhook: {...}
[CourseOnboarding] Webhook response: 200 OK
[CourseOnboarding] Starting progress polling...
[CourseOnboarding] Progress update: {vectorized: 5, total: 23, status: 'in_progress'}
[CourseOnboarding] ✓ Vectorization completed!
```

#### **Network Tab** - Key requests to monitor:
1. `POST /api/canvas-proxy` - Canvas API calls
   - Check payload: `endpoint`, `canvasToken`, `canvasDomain`
   - Response should be 200 with course data

2. `POST https://maxipad.app.n8n.cloud/webhook/canvas-sync-course`
   - Payload: `{course_id, canvas_course_id, user_id, canvas_token, canvas_domain}`
   - Should return immediately (fire-and-forget)
   - Check for network errors (CORS, 404, 500)

3. `POST https://maxipad.app.n8n.cloud/webhook/vectorize`
   - Payload: `{course_id, selected_categories, canvas_token, canvas_domain}`
   - Should return immediately
   - Look for errors in response

4. Supabase API calls (to `supabase.co`)
   - `POST` to `/rest/v1/canvas_courses` - Creating courses
   - `GET` to `/rest/v1/canvas_courses?select=*` - Loading courses
   - `PATCH` to `/rest/v1/canvas_courses` - Updating status

### 3. Supabase Studio Monitoring

Open Studio: `http://127.0.0.1:54323`

#### **Table Editor - Real-time view:**

**canvas_courses:**
- Watch `onboarding_status` change: `pending` → `in_progress` → `completed`
- Monitor `items_vectorized` increment during Phase 2
- Check `selected_categories` array after user selection

**canvas_modules:**
- Should populate after webhook processes course
- Check `category` field is set correctly

**canvas_items:**
- Should populate with module items
- Watch `vectorized` column flip to `true`

#### **SQL Editor - Run these queries:**

```sql
-- 1. Overall sync status
SELECT
  course_name,
  course_code,
  onboarding_status,
  vectorization_status,
  items_vectorized,
  total_items_to_vectorize,
  ROUND(items_vectorized::numeric / NULLIF(total_items_to_vectorize, 0) * 100, 1) as progress_pct,
  created_at
FROM canvas_courses
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

-- 2. Module breakdown by course
SELECT
  cc.course_name,
  cm.module_name,
  cm.category,
  COUNT(ci.id) as item_count,
  SUM(CASE WHEN ci.vectorized THEN 1 ELSE 0 END) as vectorized_count
FROM canvas_courses cc
JOIN canvas_modules cm ON cm.canvas_course_id = cc.id
LEFT JOIN canvas_items ci ON ci.canvas_module_id = cm.id
WHERE cc.deleted_at IS NULL
GROUP BY cc.id, cc.course_name, cm.id, cm.module_name, cm.category
ORDER BY cc.course_name, cm.module_name;

-- 3. Category distribution
SELECT
  category,
  COUNT(*) as item_count
FROM canvas_items
WHERE canvas_module_id IN (
  SELECT id FROM canvas_modules WHERE canvas_course_id = 'YOUR_COURSE_ID_HERE'
)
GROUP BY category
ORDER BY item_count DESC;

-- 4. Vectorization progress (live)
SELECT
  ci.item_name,
  ci.category,
  ci.vectorized,
  ci.updated_at
FROM canvas_items ci
JOIN canvas_modules cm ON cm.id = ci.canvas_module_id
JOIN canvas_courses cc ON cc.id = cm.canvas_course_id
WHERE cc.deleted_at IS NULL
ORDER BY ci.updated_at DESC
LIMIT 20;

-- 5. Find stuck/failed courses
SELECT
  course_name,
  onboarding_status,
  vectorization_status,
  items_vectorized,
  total_items_to_vectorize,
  EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as minutes_since_update
FROM canvas_courses
WHERE deleted_at IS NULL
  AND onboarding_status != 'completed'
  AND updated_at < NOW() - INTERVAL '10 minutes';
```

## Common Issues & Debugging

### Issue: Webhook not firing
**Check:**
- Console logs show `[CourseSelection] Firing webhook...`?
- Network tab shows the POST request?
- Is there a CORS error?
- Check webhook URL is correct

**Fix:**
```javascript
// Test webhook manually in console:
fetch('https://maxipad.app.n8n.cloud/webhook/canvas-sync-course', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    course_id: 'test-id',
    canvas_course_id: '12345',
    user_id: 'test-user'
  })
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

### Issue: Course stuck in "pending" status
**Check:**
1. Webhook completed successfully?
2. Are modules/items being created in DB?
3. Is webhook updating `onboarding_status`?

**Manual fix:**
```sql
-- Check what exists
SELECT * FROM canvas_modules WHERE canvas_course_id = 'YOUR_COURSE_ID';
SELECT * FROM canvas_items WHERE canvas_module_id IN (
  SELECT id FROM canvas_modules WHERE canvas_course_id = 'YOUR_COURSE_ID'
);

-- If data exists, manually update status
UPDATE canvas_courses
SET onboarding_status = 'pending'
WHERE id = 'YOUR_COURSE_ID';
```

### Issue: Vectorization not progressing
**Check:**
1. `total_items_to_vectorize` is set? (Should be > 0)
2. Webhook received correct payload?
3. Polling logs show updates?

**Check in DB:**
```sql
SELECT
  course_name,
  vectorization_status,
  items_vectorized,
  total_items_to_vectorize,
  NOW() - updated_at as time_since_update
FROM canvas_courses
WHERE id = 'YOUR_COURSE_ID';
```

### Issue: Canvas API errors
**Check:**
- `VITE_CANVAS_TOKEN` is valid?
- `VITE_CANVAS_DOMAIN` is correct? (e.g., `nulondon.instructure.com`)
- Token has correct permissions?

**Test manually:**
```bash
# Test in terminal
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://YOUR_DOMAIN/api/v1/courses?enrollment_state=active
```

### Issue: Modals not opening
**Check:**
1. Console for React errors
2. Are courses loaded? (`syncedCourses` array)
3. Check `onboarding_status` in DB

**Debug in console:**
```javascript
// Check state
window.dispatchEvent(new Event('storage')) // Trigger re-render

// Check if course is clickable
document.querySelector('[data-course-id]')?.click()
```

## Testing Checklist

### Phase 1 Testing:
- [ ] Click "Connect Canvas Courses" - modal opens
- [ ] Canvas courses load (check Network tab for `/api/canvas-proxy`)
- [ ] Select 2-3 courses
- [ ] Click "Sync Selected Courses"
- [ ] Watch console for webhook logs
- [ ] Verify courses appear in list with "Setup Required" badge
- [ ] Check DB: `canvas_courses` records created
- [ ] Wait for status to change (polling logs in console)
- [ ] Check DB: `canvas_modules` and `canvas_items` created

### Phase 2 Testing:
- [ ] Click course with "Setup Required" badge
- [ ] Onboarding modal opens
- [ ] Categories load with counts
- [ ] Select 2-3 categories
- [ ] Click "Vectorize Selected Content"
- [ ] Watch console for webhook logs
- [ ] Progress bar appears and updates
- [ ] Check DB: `items_vectorized` increments
- [ ] Wait for completion (status → "Ready")
- [ ] Modal closes automatically
- [ ] "Open Study Set" button appears

### Error Scenarios:
- [ ] Test with invalid Canvas credentials
- [ ] Test with no internet connection
- [ ] Test webhook timeout (kill n8n temporarily)
- [ ] Test with course that has no modules
- [ ] Test double-clicking course during sync

## Performance Monitoring

### Frontend Performance:
```javascript
// Add to browser console
performance.mark('canvas-sync-start')
// ... perform action ...
performance.mark('canvas-sync-end')
performance.measure('canvas-sync', 'canvas-sync-start', 'canvas-sync-end')
console.log(performance.getEntriesByName('canvas-sync'))
```

### Database Performance:
```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM canvas_courses
JOIN canvas_modules ON canvas_modules.canvas_course_id = canvas_courses.id
WHERE canvas_courses.user_id = 'YOUR_USER_ID';

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('canvas_courses', 'canvas_modules', 'canvas_items');
```

## Log Prefixes Reference

All console logs are prefixed for easy filtering:

- `[CourseSelection]` - CourseSelectionModal.jsx (Phase 1)
- `[CourseOnboarding]` - CourseOnboardingModal.jsx (Phase 2)
- `[CanvasSync]` - CanvasSync.jsx (Main page)

Filter in console: Type `[CourseSelection]` in the filter box to see only Phase 1 logs.

## Quick Fixes

### Reset a course to re-test:
```sql
-- Soft delete (can re-sync)
UPDATE canvas_courses SET deleted_at = NOW() WHERE id = 'COURSE_ID';

-- Hard reset (nuke everything)
DELETE FROM canvas_items WHERE canvas_module_id IN (
  SELECT id FROM canvas_modules WHERE canvas_course_id = 'COURSE_ID'
);
DELETE FROM canvas_modules WHERE canvas_course_id = 'COURSE_ID';
DELETE FROM canvas_courses WHERE id = 'COURSE_ID';
-- Don't forget to delete the study set too if needed
```

### Simulate webhook completion:
```sql
-- Manually complete Phase 1
UPDATE canvas_courses
SET onboarding_status = 'pending'
WHERE id = 'COURSE_ID';

-- Manually complete Phase 2
UPDATE canvas_courses
SET
  vectorization_status = 'completed',
  onboarding_status = 'completed',
  items_vectorized = total_items_to_vectorize
WHERE id = 'COURSE_ID';
```

## n8n Webhook Testing

Test your webhooks independently:

```bash
# Test canvas-sync-course webhook
curl -X POST https://maxipad.app.n8n.cloud/webhook/canvas-sync-course \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": "test-uuid",
    "canvas_course_id": "12345",
    "user_id": "test-user",
    "canvas_token": "test-token",
    "canvas_domain": "test.instructure.com"
  }'

# Test vectorize webhook
curl -X POST https://maxipad.app.n8n.cloud/webhook/vectorize \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": "test-uuid",
    "selected_categories": ["exercises_assignments", "lecture_slides"],
    "canvas_token": "test-token",
    "canvas_domain": "test.instructure.com"
  }'
```

---

## Emergency Stop

If something goes wrong and you need to stop everything:

```sql
-- Stop all in-progress syncs
UPDATE canvas_courses
SET
  onboarding_status = 'pending',
  vectorization_status = 'not_started',
  items_vectorized = 0
WHERE onboarding_status = 'in_progress'
   OR vectorization_status = 'in_progress';
```

Then refresh the page to stop polling.
