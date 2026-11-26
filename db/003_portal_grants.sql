REVOKE ALL ON ALL TABLES IN SCHEMA portal FROM veltaris_portal;
-- statement
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA portal FROM veltaris_portal;
-- statement
GRANT USAGE ON SCHEMA portal TO veltaris_portal;
-- statement
GRANT EXECUTE ON FUNCTION
  portal.redeem(text,text),
  portal.sign_out(text),
  portal.dashboard(text),
  portal.save_facility(text,uuid,int,jsonb),
  portal.save_document(text,uuid,text,text,text),
  portal.download_document(text,uuid),
  portal.provision(text,uuid,text,text,text,text),
  portal.follow_up(text,uuid,text,text,date,text)
TO veltaris_portal;
