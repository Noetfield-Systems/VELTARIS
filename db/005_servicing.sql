CREATE TABLE IF NOT EXISTS portal.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES portal.organizations(id),
  facility_id uuid NOT NULL REFERENCES portal.facilities(id),
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 80),
  received_on date NOT NULL CHECK (received_on BETWEEN '2000-01-01' AND '2099-12-31'),
  period int NOT NULL CHECK (period BETWEEN 1 AND 120),
  principal bigint NOT NULL CHECK (principal BETWEEN 0 AND 100000000000),
  interest bigint NOT NULL CHECK (interest BETWEEN 0 AND 100000000000),
  booked_at timestamptz NOT NULL DEFAULT now(),
  booked_by uuid NOT NULL REFERENCES portal.members(id),
  statement_reference text CHECK (length(statement_reference) BETWEEN 1 AND 80),
  statement_date date,
  matched_at timestamptz,
  matched_by uuid REFERENCES portal.members(id),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES portal.members(id),
  reversal_reason text CHECK (length(reversal_reason) BETWEEN 4 AND 300),
  CHECK (principal + interest BETWEEN 1 AND 100000000000),
  UNIQUE (organization_id, reference)
);
-- statement
CREATE INDEX IF NOT EXISTS receipts_facility_order ON portal.receipts (facility_id, received_on DESC, booked_at DESC);
-- statement
CREATE UNIQUE INDEX IF NOT EXISTS receipts_active_statement ON portal.receipts (organization_id, statement_reference)
  WHERE statement_reference IS NOT NULL AND reversed_at IS NULL;
-- statement
CREATE OR REPLACE VIEW portal.servicing_journal AS
  SELECT r.organization_id, r.facility_id, r.id AS receipt_id, r.reference, event.kind, event.effective_date,
    entry.account, CASE WHEN event.kind = 'Receipt' THEN entry.debit ELSE entry.credit END AS debit,
    CASE WHEN event.kind = 'Receipt' THEN entry.credit ELSE entry.debit END AS credit
  FROM portal.receipts r
  CROSS JOIN LATERAL (VALUES ('Receipt', r.received_on),
    ('Reversal', (r.reversed_at AT TIME ZONE 'UTC')::date)) event(kind, effective_date)
  CROSS JOIN LATERAL (VALUES ('Cash',r.principal+r.interest,0::bigint),
    ('Principal receivable',0::bigint,r.principal),('Interest income',0::bigint,r.interest)) entry(account,debit,credit)
  WHERE event.effective_date IS NOT NULL AND entry.debit + entry.credit > 0;
-- statement
CREATE OR REPLACE FUNCTION portal.servicing(p_session text, p_facility uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a portal.members;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF NOT EXISTS (SELECT 1 FROM portal.facilities WHERE id = p_facility AND organization_id = a.organization_id)
    THEN RETURN '{"error":"not_found"}'; END IF;
  RETURN jsonb_build_object('receipts', COALESCE((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.received_on DESC,r.booked_at DESC,r.id)
    FROM (SELECT id, reference, received_on, period, principal, interest, booked_at,
      statement_reference, statement_date, matched_at, reversed_at, reversal_reason
      FROM portal.receipts WHERE organization_id = a.organization_id AND facility_id = p_facility) r
  ),'[]'::jsonb),'journal',COALESCE((
    SELECT jsonb_agg(to_jsonb(j) ORDER BY j.effective_date,j.reference,j.kind,j.account)
    FROM (SELECT receipt_id,reference,kind,effective_date,account,debit,credit FROM portal.servicing_journal
      WHERE organization_id = a.organization_id AND facility_id = p_facility) j
  ),'[]'::jsonb));
END $$;
-- statement
CREATE OR REPLACE FUNCTION portal.book_receipt(p_session text,p_facility uuid,p_reference text,p_date date,p_period int,p_principal bigint,p_interest bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a portal.members; f portal.facilities; r portal.receipts; used_principal bigint;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF a.role NOT IN ('owner','editor') THEN RETURN '{"error":"forbidden"}'; END IF;
  PERFORM 1 FROM portal.organizations WHERE id = a.organization_id FOR UPDATE;
  SELECT * INTO f FROM portal.facilities WHERE id = p_facility AND organization_id = a.organization_id FOR UPDATE;
  IF f.id IS NULL THEN RETURN '{"error":"not_found"}'; END IF;
  SELECT * INTO r FROM portal.receipts WHERE organization_id = a.organization_id AND reference = p_reference;
  IF r.id IS NOT NULL THEN
    IF (r.facility_id,r.received_on,r.period,r.principal,r.interest) IS DISTINCT FROM
      (p_facility,p_date,p_period,p_principal,p_interest) THEN RETURN '{"error":"receipt_duplicate"}'; END IF;
    RETURN jsonb_build_object('id',r.id,'duplicate',true);
  END IF;
  IF p_period NOT BETWEEN 1 AND f.term OR p_date < f.start_date OR p_date > CURRENT_DATE THEN RETURN '{"error":"receipt_terms"}'; END IF;
  IF (SELECT count(*) FROM portal.receipts WHERE facility_id = f.id) >= 1000 THEN RETURN '{"error":"capacity"}'; END IF;
  SELECT COALESCE(sum(principal),0) INTO used_principal FROM portal.receipts WHERE facility_id = f.id AND reversed_at IS NULL;
  IF used_principal + p_principal > f.principal THEN RETURN '{"error":"principal_exceeded"}'; END IF;
  INSERT INTO portal.receipts (organization_id,facility_id,reference,received_on,period,principal,interest,booked_by)
  VALUES (a.organization_id,p_facility,p_reference,p_date,p_period,p_principal,p_interest,a.id) RETURNING * INTO r;
  INSERT INTO portal.activity (organization_id,member_id,action,resource_id)
  VALUES (a.organization_id,a.id,'Repayment recorded',r.id);
  RETURN jsonb_build_object('id',r.id,'duplicate',false);
END $$;
-- statement
CREATE OR REPLACE FUNCTION portal.match_receipt(p_session text,p_id uuid,p_reference text,p_date date,p_amount bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a portal.members; r portal.receipts;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF a.role NOT IN ('owner','editor') THEN RETURN '{"error":"forbidden"}'; END IF;
  PERFORM 1 FROM portal.organizations WHERE id = a.organization_id FOR UPDATE;
  SELECT * INTO r FROM portal.receipts WHERE id = p_id AND organization_id = a.organization_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN '{"error":"not_found"}'; END IF;
  IF r.reversed_at IS NOT NULL THEN RETURN '{"error":"receipt_reversed"}'; END IF;
  IF r.principal+r.interest <> p_amount OR p_date < r.received_on OR p_date > CURRENT_DATE THEN RETURN '{"error":"statement_mismatch"}'; END IF;
  IF r.matched_at IS NOT NULL THEN
    IF (r.statement_reference,r.statement_date) IS DISTINCT FROM (p_reference,p_date)
      THEN RETURN '{"error":"already_matched"}'; END IF;
    RETURN jsonb_build_object('id',r.id,'duplicate',true);
  END IF;
  IF EXISTS (SELECT 1 FROM portal.receipts WHERE organization_id = a.organization_id
    AND statement_reference = p_reference AND reversed_at IS NULL) THEN RETURN '{"error":"statement_duplicate"}'; END IF;
  UPDATE portal.receipts SET statement_reference=p_reference,statement_date=p_date,matched_at=now(),matched_by=a.id WHERE id=r.id;
  INSERT INTO portal.activity (organization_id,member_id,action,resource_id)
  VALUES (a.organization_id,a.id,'Repayment matched to statement',r.id);
  RETURN jsonb_build_object('id',r.id,'duplicate',false);
END $$;
-- statement
CREATE OR REPLACE FUNCTION portal.reverse_receipt(p_session text,p_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a portal.members; r portal.receipts;
BEGIN
  a := portal.actor(p_session);
  IF a.id IS NULL THEN RETURN '{"error":"unauthorized"}'; END IF;
  IF a.role <> 'owner' THEN RETURN '{"error":"forbidden"}'; END IF;
  PERFORM 1 FROM portal.organizations WHERE id=a.organization_id FOR UPDATE;
  SELECT * INTO r FROM portal.receipts WHERE id=p_id AND organization_id=a.organization_id FOR UPDATE;
  IF r.id IS NULL THEN RETURN '{"error":"not_found"}'; END IF;
  IF r.reversed_at IS NOT NULL THEN
    IF r.reversal_reason IS DISTINCT FROM p_reason THEN RETURN '{"error":"receipt_reversed"}'; END IF;
    RETURN jsonb_build_object('id',r.id,'duplicate',true);
  END IF;
  UPDATE portal.receipts SET reversed_at=now(),reversed_by=a.id,reversal_reason=p_reason WHERE id=r.id;
  INSERT INTO portal.activity (organization_id,member_id,action,resource_id)
  VALUES (a.organization_id,a.id,'Repayment reversed',r.id);
  RETURN jsonb_build_object('id',r.id,'duplicate',false);
END $$;
-- statement
CREATE OR REPLACE FUNCTION portal.protect_booked_terms()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF (NEW.principal,NEW.bps,NEW.term,NEW.start_date) IS DISTINCT FROM (OLD.principal,OLD.bps,OLD.term,OLD.start_date)
    AND EXISTS (SELECT 1 FROM portal.receipts WHERE facility_id=OLD.id)
    THEN RAISE EXCEPTION USING ERRCODE='P0409', MESSAGE='Booked facility terms cannot change'; END IF;
  RETURN NEW;
END $$;
-- statement
CREATE OR REPLACE TRIGGER protect_booked_terms BEFORE UPDATE ON portal.facilities
FOR EACH ROW EXECUTE FUNCTION portal.protect_booked_terms();
-- statement
REVOKE EXECUTE ON FUNCTION portal.servicing(text,uuid), portal.book_receipt(text,uuid,text,date,int,bigint,bigint),
 portal.match_receipt(text,uuid,text,date,bigint),portal.reverse_receipt(text,uuid,text),portal.protect_booked_terms() FROM PUBLIC;
-- statement
REVOKE ALL ON portal.receipts, portal.servicing_journal FROM PUBLIC, veltaris_portal, veltaris_intake;
-- statement
GRANT EXECUTE ON FUNCTION portal.servicing(text,uuid),portal.book_receipt(text,uuid,text,date,int,bigint,bigint),
 portal.match_receipt(text,uuid,text,date,bigint),portal.reverse_receipt(text,uuid,text) TO veltaris_portal;
