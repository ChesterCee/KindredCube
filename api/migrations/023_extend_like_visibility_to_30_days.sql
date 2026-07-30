UPDATE member_likes
   SET visible_at = created_at + interval '30 days',
       updated_at = now()
 WHERE matched_at IS NULL
   AND chat_started_at IS NULL
   AND visible_at < created_at + interval '30 days';
