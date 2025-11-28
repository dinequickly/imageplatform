-- Add delete policy for mood_board_items
create policy "Users can delete their own mood board items"
on public.mood_board_items for delete
using ( auth.uid() = added_by );
