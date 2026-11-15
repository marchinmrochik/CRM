export function runtimeRoleSql(settings, user, password) {
  if (!/^jobhunt_runtime_[a-f0-9]{8}$/.test(user)) throw new Error('Unexpected runtime role name');
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;
  const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
  const role = identifier(user),
    admin = identifier(settings.POSTGRES_USER);
  return `BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=${literal(user)}) THEN CREATE ROLE ${role}; END IF; END $$;
ALTER ROLE ${role} WITH LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE ${identifier(settings.POSTGRES_DB)} TO ${role};
GRANT USAGE ON SCHEMA public TO ${role};
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM ${role};
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};
ALTER DEFAULT PRIVILEGES FOR ROLE ${admin} IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${role};
ALTER DEFAULT PRIVILEGES FOR ROLE ${admin} IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${role};
REVOKE UPDATE,DELETE ON "ResumeVersion","ResumeArtifact","ApplicationEvent","DiscoverySnapshot" FROM ${role};
REVOKE INSERT,UPDATE,DELETE ON "_prisma_migrations" FROM ${role};
COMMIT;`;
}
