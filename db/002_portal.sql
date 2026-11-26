CREATE SCHEMA IF NOT EXISTS portal;
-- statement
REVOKE ALL ON SCHEMA portal FROM PUBLIC;
-- statement
CREATE TABLE IF NOT EXISTS portal.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS portal.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES portal.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  role text NOT NULL CHECK (role IN ('operator','owner','editor','viewer')),
  CHECK ((role = 'operator') = (organization_id IS NULL))
);
-- statement
CREATE TABLE IF NOT EXISTS portal.invitations (
  digest text PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
  member_id uuid NOT NULL REFERENCES portal.members(id),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz
);
-- statement
CREATE TABLE IF NOT EXISTS portal.sessions (
  digest text PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
  member_id uuid NOT NULL REFERENCES portal.members(id),
  expires_at timestamptz NOT NULL
);
-- statement
CREATE TABLE IF NOT EXISTS portal.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES portal.organizations(id),
  borrower text NOT NULL CHECK (length(trim(borrower)) BETWEEN 1 AND 100),
  asset text NOT NULL CHECK (asset IN ('Equipment','Receivables','Working capital','Real estate','Other')),
  stage text NOT NULL CHECK (stage IN ('Intake','Review','Active','Matured')),
  principal bigint NOT NULL CHECK (principal BETWEEN 100 AND 100000000000),
  bps int NOT NULL CHECK (bps BETWEEN 0 AND 3000),
  term int NOT NULL CHECK (term BETWEEN 1 AND 120),
  start_date date NOT NULL CHECK (start_date BETWEEN '2000-01-01' AND '2099-12-31'),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS portal_facilities_organization ON portal.facilities (organization_id, updated_at DESC);
-- statement
CREATE TABLE IF NOT EXISTS portal.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES portal.facilities(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  media text NOT NULL CHECK (media IN ('application/pdf','text/csv','text/plain')),
  contents bytea NOT NULL CHECK (octet_length(contents) BETWEEN 1 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS portal_documents_facility ON portal.documents (facility_id);
-- statement
CREATE TABLE IF NOT EXISTS portal.activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid REFERENCES portal.organizations(id),
  member_id uuid NOT NULL REFERENCES portal.members(id),
  action text NOT NULL,
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS portal_activity_organization ON portal.activity (organization_id, id DESC);
-- statement
CREATE TABLE IF NOT EXISTS portal.lead_followups (
  lead_id uuid PRIMARY KEY REFERENCES public.pilot_requests(id),
  stage text NOT NULL CHECK (stage IN ('New','Qualified','Discovery','Proposal','Closed won','Closed lost')),
  owner text NOT NULL CHECK (length(trim(owner)) BETWEEN 1 AND 100),
  next_date date,
  notes text NOT NULL CHECK (length(notes) <= 800),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES portal.members(id)
);
-- statement
CREATE OR REPLACE FUNCTION portal.actor(p_session text)
RETURNS portal.members LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT m.* FROM portal.sessions s JOIN portal.members m ON m.id = s.member_id
  WHERE s.digest = p_session AND s.expires_at > now()
$$;
-- statement
CREATE OR REPLACE FUNCTION portal.redeem(p_invite text, p_session text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  WITH claim AS (
    UPDATE portal.invitations SET redeemed_at = now()
    WHERE digest = p_invite AND redeemed_at IS NULL AND expires_at > now()
    RETURNING member_id
  ), opened AS (
    INSERT INTO portal.sessions (digest, member_id, expires_at)
    SELECT p_session, member_id, now() + interval '12 hours' FROM claim
    RETURNING member_id
  )
  SELECT EXISTS (SELECT FROM opened)
$$;
-- statement
CREATE OR REPLACE FUNCTION portal.sign_out(p_session text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$ DELETE FROM portal.sessions WHERE digest = p_session $$;
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
-- statement
CREATE OR REPLACE FUNCTION portal.save_facility(p_session text, p_id uuid, p_version int, p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE a portal.members; f portal.facilities;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF a.role NOT IN ('owner','editor') THEN RETURN '{"error":"forbidden"}'; END IF;
  IF p_id IS NULL THEN
    PERFORM 1 FROM portal.organizations WHERE id = a.organization_id FOR UPDATE;
    IF (SELECT count(*) FROM portal.facilities WHERE organization_id = a.organization_id) >= 100 THEN
      RETURN '{"error":"capacity"}';
    END IF;
    INSERT INTO portal.facilities (organization_id, borrower, asset, stage, principal, bps, term, start_date)
    VALUES (a.organization_id, p_fields->>'borrower', p_fields->>'asset', p_fields->>'stage',
      (p_fields->>'principal')::bigint, (p_fields->>'bps')::int, (p_fields->>'term')::int, (p_fields->>'start')::date)
    RETURNING * INTO f;
  ELSE
    UPDATE portal.facilities SET borrower = p_fields->>'borrower', asset = p_fields->>'asset',
      stage = p_fields->>'stage', principal = (p_fields->>'principal')::bigint,
      bps = (p_fields->>'bps')::int, term = (p_fields->>'term')::int, start_date = (p_fields->>'start')::date,
      version = version + 1, updated_at = now()
    WHERE id = p_id AND organization_id = a.organization_id AND version = p_version
    RETURNING * INTO f;
    IF f.id IS NULL THEN
      IF EXISTS (SELECT FROM portal.facilities WHERE id = p_id AND organization_id = a.organization_id) THEN
        RETURN '{"error":"conflict"}';
      END IF;
      RETURN '{"error":"not_found"}';
    END IF;
  END IF;
  INSERT INTO portal.activity (organization_id, member_id, action, resource_id)
  VALUES (a.organization_id, a.id, CASE WHEN p_id IS NULL THEN 'Facility created' ELSE 'Facility updated' END, f.id);
  RETURN jsonb_build_object('id', f.id, 'version', f.version);
END
$$;
-- statement
CREATE OR REPLACE FUNCTION portal.save_document(p_session text, p_facility uuid, p_name text, p_media text, p_contents text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE a portal.members; d_id uuid;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF a.role NOT IN ('owner','editor') THEN RETURN '{"error":"forbidden"}'; END IF;
  PERFORM 1 FROM portal.organizations WHERE id = a.organization_id FOR UPDATE;
  IF NOT EXISTS (SELECT FROM portal.facilities WHERE id = p_facility AND organization_id = a.organization_id) THEN
    RETURN '{"error":"not_found"}';
  END IF;
  IF (SELECT count(*) FROM portal.documents d JOIN portal.facilities f ON f.id=d.facility_id
      WHERE f.organization_id = a.organization_id) >= 20 THEN RETURN '{"error":"capacity"}'; END IF;
  INSERT INTO portal.documents (facility_id, name, media, contents)
  VALUES (p_facility, p_name, p_media, decode(p_contents, 'base64')) RETURNING id INTO d_id;
  INSERT INTO portal.activity (organization_id, member_id, action, resource_id)
  VALUES (a.organization_id, a.id, 'Document uploaded', d_id);
  RETURN jsonb_build_object('id', d_id);
END
$$;
-- statement
CREATE OR REPLACE FUNCTION portal.download_document(p_session text, p_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE a portal.members; d portal.documents;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  SELECT docs.* INTO d FROM portal.documents docs
  JOIN portal.facilities f ON f.id = docs.facility_id
  WHERE docs.id = p_id AND f.organization_id = a.organization_id;
  IF d.id IS NULL THEN RETURN '{"error":"not_found"}'; END IF;
  INSERT INTO portal.activity (organization_id, member_id, action, resource_id)
  VALUES (a.organization_id, a.id, 'Document downloaded', d.id);
  RETURN jsonb_build_object('name', d.name, 'contents', encode(d.contents, 'base64'));
END
$$;
-- statement
CREATE OR REPLACE FUNCTION portal.provision(p_session text, p_id uuid, p_org text, p_name text, p_role text, p_digest text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE a portal.members; new_member uuid; target uuid;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF a.role NOT IN ('operator','owner') OR p_role NOT IN ('owner','editor','viewer') THEN
    RETURN '{"error":"forbidden"}';
  END IF;
  IF a.role = 'owner' THEN
    IF p_role = 'owner' THEN RETURN '{"error":"forbidden"}'; END IF;
    target := a.organization_id;
  ELSIF p_id IS NULL THEN
    IF p_role <> 'owner' THEN RETURN '{"error":"forbidden"}'; END IF;
    INSERT INTO portal.organizations (name) VALUES (p_org) RETURNING id INTO target;
  ELSE
    SELECT id INTO target FROM portal.organizations WHERE id = p_id;
    IF target IS NULL THEN RETURN '{"error":"not_found"}'; END IF;
  END IF;
  INSERT INTO portal.members (organization_id, name, role) VALUES (target, p_name, p_role) RETURNING id INTO new_member;
  INSERT INTO portal.invitations (digest, member_id, expires_at) VALUES (p_digest, new_member, now() + interval '48 hours');
  INSERT INTO portal.activity (organization_id, member_id, action, resource_id) VALUES (target, a.id, 'Member invited', new_member);
  RETURN jsonb_build_object('organizationId', target, 'memberId', new_member);
END
$$;
-- statement
CREATE OR REPLACE FUNCTION portal.follow_up(p_session text, p_id uuid, p_stage text, p_owner text, p_next date, p_notes text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE a portal.members;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF a.role <> 'operator' THEN RETURN '{"error":"forbidden"}'; END IF;
  IF NOT EXISTS (SELECT FROM public.pilot_requests WHERE id = p_id AND email NOT LIKE '%@example.test') THEN
    RETURN '{"error":"not_found"}';
  END IF;
  INSERT INTO portal.lead_followups (lead_id, stage, owner, next_date, notes, updated_by)
  VALUES (p_id, p_stage, p_owner, p_next, p_notes, a.id)
  ON CONFLICT (lead_id) DO UPDATE SET stage = EXCLUDED.stage, owner = EXCLUDED.owner,
    next_date = EXCLUDED.next_date, notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO portal.activity (member_id, action, resource_id) VALUES (a.id, 'Pilot follow-up recorded', p_id);
  RETURN jsonb_build_object('id', p_id);
END
$$;
-- statement
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA portal FROM PUBLIC;
