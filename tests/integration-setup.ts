if (
  !process.env.CI &&
  (process.env.POSTGRES_DB !== 'jobhunt_e2e' ||
    process.env.POSTGRES_PORT !== '45442' ||
    !process.env.STORAGE_PATH?.includes('test-'))
) {
  throw new Error(
    'Integration tests require the disposable database and isolated PDF storage. Run pnpm test. Personal database access is blocked.',
  );
}
