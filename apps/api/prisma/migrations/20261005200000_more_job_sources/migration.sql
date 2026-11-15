ALTER TABLE "DiscoverySource" DROP CONSTRAINT "discovery_connector";
ALTER TABLE "DiscoverySource" ADD CONSTRAINT "discovery_connector"
  CHECK ("connector" IN ('remotive', 'arbeitnow', 'jobicy', 'himalayas', 'remoteok'));

-- Normalize legacy provider date strings before using lexicographic UTC comparisons.
UPDATE "DiscoveryListing" SET "publishedAt" =
  to_char("publishedAt"::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  WHERE "publishedAt" IS NOT NULL;
