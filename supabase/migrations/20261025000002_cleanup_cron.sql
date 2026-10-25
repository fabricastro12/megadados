-- Hourly cleanup of rooms nobody touched in 6 hours (games, players and answers cascade).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('megadados-cleanup-rooms', '17 * * * *', $$select public.cleanup_expired_rooms()$$);
