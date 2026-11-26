ALTER TABLE public.pilot_requests
  ADD COLUMN IF NOT EXISTS utm_source varchar(80),
  ADD COLUMN IF NOT EXISTS utm_medium varchar(80),
  ADD COLUMN IF NOT EXISTS utm_campaign varchar(80),
  ADD COLUMN IF NOT EXISTS utm_content varchar(80),
  ADD COLUMN IF NOT EXISTS entry_page varchar(32);
-- statement
GRANT INSERT (utm_source, utm_medium, utm_campaign, utm_content, entry_page)
  ON public.pilot_requests TO veltaris_intake;
-- statement
CREATE OR REPLACE FUNCTION portal.dashboard(p_session text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE a portal.members;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.role = 'operator' THEN
    RETURN jsonb_build_object('name', a.name, 'role', a.role,
      'organizations', COALESCE((
        SELECT jsonb_agg(to_jsonb(o)) FROM (SELECT id, name FROM portal.organizations ORDER BY name, id LIMIT 100) o
      ), '[]'::jsonb),
      'leads', COALESCE((
        SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC) FROM (
          SELECT p.id, p.name, p.company, p.email, p.workflow, p.context, p.created_at,
            p.utm_source, p.utm_medium, p.utm_campaign, p.utm_content, p.entry_page,
            COALESCE(f.stage, 'New') AS stage, f.owner, f.next_date, f.notes
          FROM public.pilot_requests p LEFT JOIN portal.lead_followups f ON p.id = f.lead_id
          WHERE p.email NOT LIKE '%@example.test'
          ORDER BY p.created_at DESC, p.id LIMIT 100
        ) l
      ), '[]'::jsonb));
  END IF;
  RETURN jsonb_build_object('name', a.name, 'role', a.role,
    'organization', (SELECT name FROM portal.organizations WHERE id = a.organization_id),
    'facilities', COALESCE((
      SELECT jsonb_agg(to_jsonb(f) ORDER BY f.updated_at DESC) FROM (
        SELECT id, borrower, asset, stage, principal, bps, term, start_date AS start, version, updated_at
        FROM portal.facilities WHERE organization_id = a.organization_id
      ) f
    ), '[]'::jsonb),
    'documents', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC) FROM (
        SELECT d.id, d.name, d.facility_id, octet_length(d.contents) AS size, d.created_at
        FROM portal.documents d JOIN portal.facilities f ON d.facility_id = f.id
        WHERE f.organization_id = a.organization_id
      ) d
    ), '[]'::jsonb),
    'activity', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id DESC) FROM (
        SELECT e.id, e.action, e.created_at, m.name AS member
        FROM portal.activity e JOIN portal.members m ON m.id = e.member_id
        WHERE e.organization_id = a.organization_id ORDER BY e.id DESC LIMIT 30
      ) e
    ), '[]'::jsonb));
END
$$;
