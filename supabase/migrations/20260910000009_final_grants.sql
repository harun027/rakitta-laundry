-- ========================================================================
-- 09 — Final Grants on Functions
-- ========================================================================

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_tracking(TEXT) TO anon, authenticated;
