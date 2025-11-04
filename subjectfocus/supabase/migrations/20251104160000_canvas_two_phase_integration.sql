-- Canvas Two-Phase Integration Migration
-- Adds support for module/item selection and vectorization tracking

-- =============================================
-- 1. Create canvas_modules table
-- =============================================
CREATE TABLE IF NOT EXISTS public.canvas_modules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    canvas_course_id uuid NOT NULL REFERENCES public.canvas_courses(id) ON DELETE CASCADE,
    canvas_module_id text NOT NULL,
    module_name text NOT NULL,
    position integer DEFAULT 0,
    category text CHECK (category = ANY (ARRAY[
        'exercises_assignments',
        'lecture_slides',
        'readings',
        'past_exams',
        'administrative',
        'videos',
        'discussion',
        'other'
    ])),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(canvas_course_id, canvas_module_id)
);

COMMENT ON TABLE public.canvas_modules IS 'Canvas course modules with LLM-categorized content types';
COMMENT ON COLUMN public.canvas_modules.category IS 'Content category determined by LLM during sync';

-- =============================================
-- 2. Create canvas_items table
-- =============================================
CREATE TABLE IF NOT EXISTS public.canvas_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    canvas_module_id uuid NOT NULL REFERENCES public.canvas_modules(id) ON DELETE CASCADE,
    canvas_item_id text NOT NULL,
    item_type text NOT NULL, -- 'Page', 'Assignment', 'File', 'ExternalUrl', 'Quiz', etc.
    item_name text NOT NULL,
    content_url text,
    position integer DEFAULT 0,
    category text CHECK (category = ANY (ARRAY[
        'exercises_assignments',
        'lecture_slides',
        'readings',
        'past_exams',
        'administrative',
        'videos',
        'discussion',
        'other'
    ])),
    vectorized boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(canvas_module_id, canvas_item_id)
);

COMMENT ON TABLE public.canvas_items IS 'Individual items within Canvas modules';
COMMENT ON COLUMN public.canvas_items.category IS 'Content category determined by LLM, can differ from parent module';
COMMENT ON COLUMN public.canvas_items.vectorized IS 'Whether this item has been processed and vectorized';

-- =============================================
-- 3. Add onboarding columns to canvas_courses
-- =============================================
ALTER TABLE public.canvas_courses
ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'pending'
    CHECK (onboarding_status = ANY (ARRAY['pending', 'in_progress', 'completed'])),
ADD COLUMN IF NOT EXISTS selected_categories text[] DEFAULT ARRAY[]::text[],
ADD COLUMN IF NOT EXISTS vectorization_status text DEFAULT 'not_started'
    CHECK (vectorization_status = ANY (ARRAY['not_started', 'in_progress', 'completed', 'failed'])),
ADD COLUMN IF NOT EXISTS items_vectorized integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_items_to_vectorize integer DEFAULT 0;

COMMENT ON COLUMN public.canvas_courses.onboarding_status IS 'Tracks user completion of per-course setup flow';
COMMENT ON COLUMN public.canvas_courses.selected_categories IS 'Content types user selected for vectorization';
COMMENT ON COLUMN public.canvas_courses.vectorization_status IS 'Status of background vectorization process';
COMMENT ON COLUMN public.canvas_courses.items_vectorized IS 'Count of items processed during vectorization';
COMMENT ON COLUMN public.canvas_courses.total_items_to_vectorize IS 'Total items to process based on selected categories';

-- =============================================
-- 4. Add linked_canvas_courses to study_sets
-- =============================================
ALTER TABLE public.study_sets
ADD COLUMN IF NOT EXISTS linked_canvas_courses uuid[] DEFAULT ARRAY[]::uuid[];

COMMENT ON COLUMN public.study_sets.linked_canvas_courses IS 'Array of canvas_courses.id values linked to this study set';

-- =============================================
-- 5. Soft-delete existing canvas_courses
-- =============================================
-- This ensures clean migration to two-phase flow
-- Users will re-sync courses using the new workflow
UPDATE public.canvas_courses
SET deleted_at = now()
WHERE deleted_at IS NULL;

COMMENT ON TABLE public.canvas_courses IS 'Canvas courses synced by users. Existing records soft-deleted for clean migration to two-phase flow.';

-- =============================================
-- 6. Enable RLS on new tables
-- =============================================
ALTER TABLE public.canvas_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_items ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 7. RLS Policies for canvas_modules
-- =============================================
-- Users can view modules for their own courses
CREATE POLICY "Users can view their own Canvas modules"
ON public.canvas_modules FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_courses cc
        WHERE cc.id = canvas_modules.canvas_course_id
        AND cc.user_id = auth.uid()
    )
);

-- Users can insert modules for their own courses
CREATE POLICY "Users can insert Canvas modules for their courses"
ON public.canvas_modules FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.canvas_courses cc
        WHERE cc.id = canvas_modules.canvas_course_id
        AND cc.user_id = auth.uid()
    )
);

-- Users can update modules for their own courses
CREATE POLICY "Users can update their own Canvas modules"
ON public.canvas_modules FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_courses cc
        WHERE cc.id = canvas_modules.canvas_course_id
        AND cc.user_id = auth.uid()
    )
);

-- Users can delete modules for their own courses
CREATE POLICY "Users can delete their own Canvas modules"
ON public.canvas_modules FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_courses cc
        WHERE cc.id = canvas_modules.canvas_course_id
        AND cc.user_id = auth.uid()
    )
);

-- =============================================
-- 8. RLS Policies for canvas_items
-- =============================================
-- Users can view items in their own modules
CREATE POLICY "Users can view their own Canvas items"
ON public.canvas_items FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_modules cm
        JOIN public.canvas_courses cc ON cc.id = cm.canvas_course_id
        WHERE cm.id = canvas_items.canvas_module_id
        AND cc.user_id = auth.uid()
    )
);

-- Users can insert items in their own modules
CREATE POLICY "Users can insert Canvas items in their modules"
ON public.canvas_items FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.canvas_modules cm
        JOIN public.canvas_courses cc ON cc.id = cm.canvas_course_id
        WHERE cm.id = canvas_items.canvas_module_id
        AND cc.user_id = auth.uid()
    )
);

-- Users can update items in their own modules
CREATE POLICY "Users can update their own Canvas items"
ON public.canvas_items FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_modules cm
        JOIN public.canvas_courses cc ON cc.id = cm.canvas_course_id
        WHERE cm.id = canvas_items.canvas_module_id
        AND cc.user_id = auth.uid()
    )
);

-- Users can delete items in their own modules
CREATE POLICY "Users can delete their own Canvas items"
ON public.canvas_items FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_modules cm
        JOIN public.canvas_courses cc ON cc.id = cm.canvas_course_id
        WHERE cm.id = canvas_items.canvas_module_id
        AND cc.user_id = auth.uid()
    )
);

-- =============================================
-- 9. Create indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_canvas_modules_course_id ON public.canvas_modules(canvas_course_id);
CREATE INDEX IF NOT EXISTS idx_canvas_modules_category ON public.canvas_modules(category);
CREATE INDEX IF NOT EXISTS idx_canvas_items_module_id ON public.canvas_items(canvas_module_id);
CREATE INDEX IF NOT EXISTS idx_canvas_items_category ON public.canvas_items(category);
CREATE INDEX IF NOT EXISTS idx_canvas_items_vectorized ON public.canvas_items(vectorized);
CREATE INDEX IF NOT EXISTS idx_canvas_courses_onboarding_status ON public.canvas_courses(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_study_sets_linked_canvas_courses ON public.study_sets USING GIN(linked_canvas_courses);

-- =============================================
-- 10. Update triggers for updated_at
-- =============================================
CREATE TRIGGER update_canvas_modules_updated_at
    BEFORE UPDATE ON public.canvas_modules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_canvas_items_updated_at
    BEFORE UPDATE ON public.canvas_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
