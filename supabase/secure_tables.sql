-- 1. Secure Sessions Table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions"
ON public.sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions"
ON public.sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
ON public.sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions"
ON public.sessions FOR DELETE
USING (auth.uid() = user_id);


-- 2. Secure Mood Board Items Table
ALTER TABLE public.mood_board_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mood board items"
ON public.mood_board_items FOR SELECT
USING (
  auth.uid() = added_by 
  OR 
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = mood_board_items.session_id 
    AND sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own mood board items"
ON public.mood_board_items FOR INSERT
WITH CHECK (
  auth.uid() = added_by
  OR 
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = mood_board_items.session_id 
    AND sessions.user_id = auth.uid()
  )
);

-- Note: Delete/Update policies might partially exist from previous fixes, 
-- but these ensure full coverage.
CREATE POLICY "Users can update their own mood board items full"
ON public.mood_board_items FOR UPDATE
USING (
  auth.uid() = added_by
  OR 
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = mood_board_items.session_id 
    AND sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own mood board items full"
ON public.mood_board_items FOR DELETE
USING (
  auth.uid() = added_by
  OR 
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = mood_board_items.session_id 
    AND sessions.user_id = auth.uid()
  )
);


-- 3. Secure Generations Table
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own generations"
ON public.generations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = generations.session_id 
    AND sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own generations"
ON public.generations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = generations.session_id 
    AND sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own generations"
ON public.generations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = generations.session_id 
    AND sessions.user_id = auth.uid()
  )
);
