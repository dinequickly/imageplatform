-- Add missing columns to canvas_courses table
ALTER TABLE public.canvas_courses
ADD COLUMN IF NOT EXISTS start_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS end_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone;

-- Create canvas_assignments table
CREATE TABLE IF NOT EXISTS public.canvas_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    canvas_course_id uuid NOT NULL,
    canvas_assignment_id text NOT NULL,
    assignment_name text NOT NULL,
    assignment_description text,
    due_date timestamp with time zone,
    points_possible numeric,
    flashcards_generated boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT canvas_assignments_canvas_course_id_fkey
        FOREIGN KEY (canvas_course_id)
        REFERENCES public.canvas_courses(id)
        ON DELETE CASCADE,
    CONSTRAINT canvas_assignments_unique_assignment
        UNIQUE (canvas_course_id, canvas_assignment_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_canvas_assignments_course_id
    ON public.canvas_assignments(canvas_course_id);

CREATE INDEX IF NOT EXISTS idx_canvas_assignments_canvas_assignment_id
    ON public.canvas_assignments(canvas_assignment_id);

-- Add RLS policies for canvas_assignments
ALTER TABLE public.canvas_assignments ENABLE ROW LEVEL SECURITY;

-- Users can view their own assignments (through canvas_courses)
CREATE POLICY "Users can view their own Canvas assignments"
    ON public.canvas_assignments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.canvas_courses
            WHERE canvas_courses.id = canvas_assignments.canvas_course_id
            AND canvas_courses.user_id = auth.uid()
        )
    );

-- Users can insert their own assignments (through canvas_courses)
CREATE POLICY "Users can insert their own Canvas assignments"
    ON public.canvas_assignments
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.canvas_courses
            WHERE canvas_courses.id = canvas_assignments.canvas_course_id
            AND canvas_courses.user_id = auth.uid()
        )
    );

-- Users can update their own assignments (through canvas_courses)
CREATE POLICY "Users can update their own Canvas assignments"
    ON public.canvas_assignments
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.canvas_courses
            WHERE canvas_courses.id = canvas_assignments.canvas_course_id
            AND canvas_courses.user_id = auth.uid()
        )
    );

-- Users can delete their own assignments (through canvas_courses)
CREATE POLICY "Users can delete their own Canvas assignments"
    ON public.canvas_assignments
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.canvas_courses
            WHERE canvas_courses.id = canvas_assignments.canvas_course_id
            AND canvas_courses.user_id = auth.uid()
        )
    );

-- Add updated_at trigger for canvas_assignments
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_canvas_assignments_updated_at
    BEFORE UPDATE ON public.canvas_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.canvas_assignments IS 'Stores Canvas LMS assignments linked to courses';
COMMENT ON COLUMN public.canvas_assignments.canvas_course_id IS 'Foreign key to canvas_courses table';
COMMENT ON COLUMN public.canvas_assignments.canvas_assignment_id IS 'Canvas assignment ID from Canvas API';
COMMENT ON COLUMN public.canvas_assignments.flashcards_generated IS 'Whether flashcards have been generated from this assignment';
