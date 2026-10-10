CREATE TABLE public.forest_hop_scores (
    name varchar(12) PRIMARY KEY CHECK (length(btrim(name)) > 0),
    score integer NOT NULL CHECK (score >= 0)
);
CREATE INDEX forest_hop_scores_ranking ON public.forest_hop_scores (score DESC, name ASC);
ALTER TABLE public.forest_hop_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forest_hop_scores FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.forest_hop_scores TO service_role;

CREATE FUNCTION public.forest_hop_submit(player_name text, run_score integer)
RETURNS SETOF public.forest_hop_scores
LANGUAGE sql
SET search_path = public
AS $$
    INSERT INTO public.forest_hop_scores AS scores (name, score)
    VALUES (btrim(player_name), run_score)
    ON CONFLICT (name) DO UPDATE SET score = GREATEST(scores.score, EXCLUDED.score)
    RETURNING scores.*;
$$;
REVOKE ALL ON FUNCTION public.forest_hop_submit(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forest_hop_submit(text, integer) TO service_role;
