DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kindred_app') THEN
    CREATE ROLE kindred_app LOGIN PASSWORD 'local-app-only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;
GRANT CONNECT ON DATABASE kindredcube TO kindred_app;
GRANT USAGE ON SCHEMA public TO kindred_app;
