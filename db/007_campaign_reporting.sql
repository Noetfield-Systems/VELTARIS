CREATE TABLE IF NOT EXISTS portal.campaign_counts (
  day date NOT NULL,
  variant text NOT NULL CHECK (variant IN ('control-landscape','journal-square','founder-post')),
  event text NOT NULL CHECK (event IN ('landing','demo','demo_match','pilot_intent')),
  total bigint NOT NULL CHECK (total > 0),
  PRIMARY KEY (day,variant,event)
);
-- statement
REVOKE ALL ON portal.campaign_counts FROM PUBLIC, veltaris_portal, veltaris_intake;
-- statement
CREATE OR REPLACE FUNCTION public.record_veltaris_campaign(p_variant text,p_event text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO portal.campaign_counts(day,variant,event,total)
  VALUES ((now() AT TIME ZONE 'UTC')::date,p_variant,p_event,1)
  ON CONFLICT (day,variant,event) DO UPDATE SET total=portal.campaign_counts.total+1
$$;
-- statement
REVOKE EXECUTE ON FUNCTION public.record_veltaris_campaign(text,text) FROM PUBLIC, veltaris_portal;
-- statement
GRANT EXECUTE ON FUNCTION public.record_veltaris_campaign(text,text) TO veltaris_intake;
-- statement
CREATE OR REPLACE FUNCTION portal.campaign_report(p_session text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor portal.members; cutoff date := (now() AT TIME ZONE 'UTC')::date - 29;
BEGIN
  actor := portal.actor(p_session);
  IF actor.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF actor.role <> 'operator' THEN RETURN '{"error":"forbidden"}'; END IF;
  RETURN jsonb_build_object('from',cutoff,'through',(now() AT TIME ZONE 'UTC')::date,'variants',COALESCE((
    SELECT jsonb_agg(to_jsonb(summary) ORDER BY summary.variant)
    FROM (
      SELECT v.variant, COALESCE(e.landing,0) AS landing, COALESCE(e.demo,0) AS demo,
        COALESCE(e.demo_match,0) AS demo_match, COALESCE(e.pilot_intent,0) AS pilot_intent,
        COALESCE(l.requests,0) AS requests, COALESCE(l.in_pipeline,0) AS in_pipeline
      FROM (VALUES ('control-landscape','paid-social'),('journal-square','paid-social'),('founder-post','organic-social')) v(variant,medium)
      LEFT JOIN LATERAL (
        SELECT sum(total) FILTER(WHERE event='landing') AS landing, sum(total) FILTER(WHERE event='demo') AS demo,
          sum(total) FILTER(WHERE event='demo_match') AS demo_match, sum(total) FILTER(WHERE event='pilot_intent') AS pilot_intent
        FROM portal.campaign_counts WHERE day>=cutoff AND variant=v.variant
      ) e ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS requests, count(*) FILTER(WHERE f.stage IN ('Qualified','Discovery','Proposal','Closed won')) AS in_pipeline
        FROM public.pilot_requests p LEFT JOIN portal.lead_followups f ON f.lead_id=p.id
        WHERE p.created_at>=cutoff::timestamp AT TIME ZONE 'UTC' AND lower(p.utm_content)=v.variant
          AND lower(p.utm_source)='linkedin' AND lower(p.utm_medium)=v.medium
          AND lower(p.utm_campaign)='private-credit-launch' AND p.email NOT LIKE '%@example.test'
      ) l ON true
    ) summary
  ),'[]'::jsonb));
END $$;
-- statement
REVOKE EXECUTE ON FUNCTION portal.campaign_report(text) FROM PUBLIC, veltaris_intake;
-- statement
GRANT EXECUTE ON FUNCTION portal.campaign_report(text) TO veltaris_portal;
