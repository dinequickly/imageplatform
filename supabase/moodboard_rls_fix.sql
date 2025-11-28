-- Add Delete policy for mood_board_items
create policy "Users can delete their own mood board items"
  on public.mood_board_items for delete
  using (
    auth.uid() = added_by
    OR
    exists (
      select 1 from public.sessions
      where sessions.id = mood_board_items.session_id
      and sessions.user_id = auth.uid()
    )
  );

-- Ensure Update policy also exists for name changes
create policy "Users can update their own mood board items"
  on public.mood_board_items for update
  using (
    auth.uid() = added_by
    OR
    exists (
      select 1 from public.sessions
      where sessions.id = mood_board_items.session_id
      and sessions.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = added_by
    OR
    exists (
      select 1 from public.sessions
      where sessions.id = mood_board_items.session_id
      and sessions.user_id = auth.uid()
    )
  );
