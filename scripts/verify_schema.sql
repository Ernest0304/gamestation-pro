-- Verify schema changes
SELECT 'members columns:' AS check, string_agg(column_name, ', ') AS columns
FROM information_schema.columns WHERE table_name = 'members'
UNION ALL
SELECT 'sessions columns:', string_agg(column_name, ', ')
FROM information_schema.columns WHERE table_name = 'sessions'
UNION ALL
SELECT 'settings columns:', string_agg(column_name, ', ')
FROM information_schema.columns WHERE table_name = 'settings'
UNION ALL
SELECT 'top_ups exists:', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='top_ups') THEN 'YES' ELSE 'NO' END
UNION ALL
SELECT 'members with bind_code:', count(*)::text FROM members WHERE bind_code IS NOT NULL;
