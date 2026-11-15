# Local operation and deferred hosting

The owner has explicitly deferred internet deployment. The application currently runs on loopback via `compose.yaml`; no hosted release, domain, public ingress or cloud database has been provisioned.

Run `docker compose --profile app up --build --detach --wait --wait-timeout 180`, then open `http://127.0.0.1:43170`. Read `README.md` for initialization, ports, backups and recovery. Preserve database volumes during routine shutdown.

The standalone demo, `/demo` route and demo build configuration have been removed. Personal records, imported provider content, PDF artifacts and backups remain private and ignored by Git. Production does not seed example data.

Browser tests run separately with `node scripts/test-e2e.mjs`, using the disposable `compose.e2e.yaml` stack. It has its own database, network and PDF volume; the runner removes that test project afterward. Tests cannot run locally against the owner base URL by default. CI uses its existing disposable database.

Before any future hosting request, review HTTPS ingress, session cookies and proxy configuration, restrictive database credentials, private artifact storage, independent backups, secret rotation, dependency updates and provider redistribution terms. A successful local build and test run does not authorize deployment.
