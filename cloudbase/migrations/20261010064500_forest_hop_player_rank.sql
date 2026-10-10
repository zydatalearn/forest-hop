CREATE FUNCTION public.forest_hop_ranking(player_name text)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
    WITH ranked AS (
        SELECT name, score, row_number() OVER (ORDER BY score DESC, name ASC) AS rank
        FROM public.forest_hop_scores
    )
    SELECT jsonb_build_object(
        'records', COALESCE((SELECT jsonb_agg(to_jsonb(top_scores) ORDER BY rank)
            FROM (SELECT * FROM ranked ORDER BY rank LIMIT 10) AS top_scores), '[]'::jsonb),
        'self', (SELECT to_jsonb(own_score) FROM ranked AS own_score WHERE name = player_name)
    );
$$;
REVOKE ALL ON FUNCTION public.forest_hop_ranking(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forest_hop_ranking(text) TO service_role;
