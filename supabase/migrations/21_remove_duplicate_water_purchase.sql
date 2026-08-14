-- User-reported: a double-tap on the split-purchase button created two identical
-- "Воду (вместе, 2 чел.)" rows, 15 ₽ each, 0.5s apart. Removing both — the person
-- doing the actual manual cleanup has no way to delete someone else's purchase row
-- through the app (by design, see migration-15), so this runs with migration
-- privileges instead of through the normal API.
delete from public.purchases
where id in ('0e6d7b74-4dc2-4058-9be7-d5d0c2b2ea64', 'e6393cb0-be68-4f35-bdcd-d749264bf2b0');
