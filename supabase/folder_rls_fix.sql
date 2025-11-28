-- Add Update/Delete policies for folder_items

create policy "Users can update items in their folders"
  on public.folder_items for update
  using (
    exists (
      select 1 from public.folders
      where folders.id = folder_items.folder_id
      and folders.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.folders
      where folders.id = folder_items.folder_id
      and folders.user_id = auth.uid()
    )
  );

create policy "Users can delete items in their folders"
  on public.folder_items for delete
  using (
    exists (
      select 1 from public.folders
      where folders.id = folder_items.folder_id
      and folders.user_id = auth.uid()
    )
  );
