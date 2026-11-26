-- הוספת דשא המועדון והמקלטים להגדרות. מריצים פעם אחת ב-SQL Editor של Supabase.
update public.settings set data = jsonb_set(data, '{buildings}', (
  select jsonb_agg(x.b order by case x.b->>'id' when 'public' then 1 when 'sport' then 2 when 'shelters' then 3 when 'noar' then 4 else 9 end)
  from (
    select case when b->>'id' = 'sport' then
             jsonb_set(b || jsonb_build_object('name', 'מתחמי חוץ'), '{rooms}',
               (b->'rooms') || case when exists (select 1 from jsonb_array_elements(b->'rooms') r where r->>'id' = 'lawn') then '[]'::jsonb
                                    else jsonb_build_array($j${"id": "lawn", "name": "דשא המועדון", "capacity": "", "maxAdvanceDays": 60, "bufferMin": 0, "description": "דשא ליד המועדון, לאירועים בחוץ.", "payLink": "", "rules": "", "options": [], "photoId": "room-lawn.svg"}$j$::jsonb) end)
           else b end as b
    from jsonb_array_elements(data->'buildings') b
    union all
    select jsonb_build_object('id', 'shelters', 'name', 'מקלטים', 'address', '', 'closedDates', '[]'::jsonb,
             'schedule', (select b2->'schedule' from jsonb_array_elements(data->'buildings') b2 where b2->>'id' = 'public'),
             'rooms', $j$[{"id": "aquarium", "name": "האקווריום", "capacity": "", "maxAdvanceDays": 60, "bufferMin": 0, "description": "מקלט קהילתי.", "payLink": "", "rules": "", "options": [], "photoId": "room-shelter.svg"}, {"id": "colombia", "name": "קולומביה", "capacity": "", "maxAdvanceDays": 60, "bufferMin": 0, "description": "מקלט קהילתי.", "payLink": "", "rules": "", "options": [], "photoId": "room-shelter.svg"}, {"id": "yael", "name": "יעל מלכה", "capacity": "", "maxAdvanceDays": 60, "bufferMin": 0, "description": "מקלט קהילתי.", "payLink": "", "rules": "", "options": [], "photoId": "room-shelter.svg"}]$j$::jsonb)
    where not exists (select 1 from jsonb_array_elements(data->'buildings') b3 where b3->>'id' = 'shelters')
  ) x)), updated_at = now()
where id = 1;

select b->>'name' as area, string_agg(r->>'name', ', ') as rooms from public.settings, jsonb_array_elements(data->'buildings') b, jsonb_array_elements(b->'rooms') r group by b->>'name', b->>'id' order by min(b->>'id');
