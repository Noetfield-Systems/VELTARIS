CREATE OR REPLACE FUNCTION portal.return_invitation(p_session text, p_digest text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE a portal.members;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  PERFORM 1 FROM portal.members WHERE id = a.id FOR UPDATE;
  UPDATE portal.invitations SET expires_at = now()
  WHERE member_id = a.id AND redeemed_at IS NULL AND expires_at > now();
  INSERT INTO portal.invitations (digest, member_id, expires_at)
  VALUES (p_digest, a.id, now() + interval '7 days');
  INSERT INTO portal.activity (organization_id, member_id, action, resource_id)
  VALUES (a.organization_id, a.id, 'Return invitation created', a.id);
  RETURN '{"ok":true}';
END
$$;
-- statement
REVOKE EXECUTE ON FUNCTION portal.return_invitation(text,text) FROM PUBLIC;
-- statement
GRANT EXECUTE ON FUNCTION portal.return_invitation(text,text) TO veltaris_portal;
