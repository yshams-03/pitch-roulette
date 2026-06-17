-- Run in Supabase SQL Editor if sign-up fails with "database error saving new user"
-- Fixes duplicate username collisions on profile creation

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  final_username text;
begin
  base_username := lower(coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)));
  final_username := base_username;

  begin
    insert into public.profiles (id, username, display_name, avatar_color)
    values (
      new.id,
      final_username,
      coalesce(new.raw_user_meta_data->>'display_name', 'Player'),
      coalesce(new.raw_user_meta_data->>'avatar_color', '#22c55e')
    );
  exception when unique_violation then
    final_username := base_username || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
    insert into public.profiles (id, username, display_name, avatar_color)
    values (
      new.id,
      final_username,
      coalesce(new.raw_user_meta_data->>'display_name', 'Player'),
      coalesce(new.raw_user_meta_data->>'avatar_color', '#22c55e')
    );
  end;

  return new;
end;
$$;
