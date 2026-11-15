# Job source research

Reviewed on October 5, 2026. Focus: a private remote-job discovery inbox for Europe, the USA and worldwide hiring. This is a practical selection of major boards and useful public interfaces, not an exhaustive list or a traffic ranking. API availability and terms can change; verify them before each new integration.

## Connected JSON feeds

| Source | Market and access | Current import scope | Attribution and constraints |
| --- | --- | --- | --- |
| [Remotive](https://github.com/remotive-com/remote-jobs-api) | Worldwide remote; no key | Software development feed; at most 500 validated rows; every six hours | Keep Remotive URL/name. Public data is delayed 24 hours. |
| [Arbeitnow](https://www.arbeitnow.com/blog/job-board-api) | Europe, especially Germany; no key | Remote records on the first page; every six hours | Keep provider URL/name. This is not all European vacancies. |
| [Jobicy](https://github.com/Jobicy/remote-jobs-api) | Worldwide remote; no key | Latest 200 postings from the seven-day feed; every six hours | Preserve Jobicy canonical URL and attribution. Public cursor pagination is available. Hourly polling is the documented minimum interval; this app is more conservative. Absence from the seven-day feed does not prove closure. |
| [Himalayas](https://himalayas.app/docs/remote-jobs-api) | Worldwide remote; no key | Five cursor pages, up to 100 recent jobs; every 24 hours | Visible Himalayas attribution and backlink. Feed updates daily. Browse API has 20 rows per page; country/keyword/seniority search endpoint is also available. Stored country restrictions do not establish individual work authorization. |
| [Remote OK](https://remoteok.com/api) | Worldwide remote; no key | Public feed, at most 500 response entries; every six hours | Preserve Remote OK listing URL/name and backlink without `nofollow`. Its logo requires permission; this app uses text attribution. Metadata/terms row is excluded from listings. |

Coverage caps are shown in Sources. The application searches records already imported into PostgreSQL, not the entire internet on each keystroke. Provider failures and attempts appear in System activity and source history. Monitoring is off by default. Existing per-source cooldowns apply to manual import and automatic retries. Missing listings are not automatically marked closed.

Each listing displays role, company, source, provider geography, publication date, original URL and plain-text description. Company, all-word keyword, location-text, source, publication age, personal disposition and unseen filters are available. Saved searches preserve filters. A listing enters the application CRM only after explicit promotion; repeated promotion returns the same vacancy. Raw HTML is never rendered as provider markup.

## Useful next integrations

| Source | Access | Decision for this release |
| --- | --- | --- |
| [DOU](https://jobs.dou.ua/) / [official RSS](https://jobs.dou.ua/vacancies/feeds/) | Public RSS advertised by the board; Ukrainian tech and overseas roles | High priority for a bounded XML adapter. Confirm redistribution conditions; preserve original links. Do not scrape full pages to fill missing RSS fields. |
| [Djinni](https://djinni.co/jobs/) / [official RSS](https://djinni.co/jobs/rss/) | Public RSS advertised on the jobs page | Same priority as DOU. RSS is a usable discovery route; do not assume access to every logged-in vacancy or a public full-search JSON API. |
| [Adzuna](https://developer.adzuna.com/overview) | Developer registration, `app_id` and `app_key` | High priority for broader country searches after an account is available. Review account quota, supported country editions and permitted caching. |
| [Jooble](https://help.jooble.org/en/support/solutions/articles/60000922689-how-to-connect-to-the-jooble-rest-api-after-receiving-the-key) | API key; target-country registration/domain | Useful global aggregator. Add credential handling and regional query profiles before connecting. |
| [Reed](https://www.reed.co.uk/developers/jobseeker) | API key; UK job search | Useful UK expansion; not a general Europe feed. |
| [The Muse](https://www.themuse.com/developers) / [API reference](https://www.themuse.com/developers/api/v2) | App registration required beyond testing | Useful US coverage. Keyless testing access is not permission for a persistent production import. |
| [Careerjet](https://www.careerjet.com/partners/api/javascript) | Partner API key, user IP/agent and referring-page requirements | Consider after reviewing partner conditions and privacy implications. Not a keyless feed. |
| [France Travail](https://www.data.gouv.fr/dataservices/api-offres-demploi) | Official API; platform registration and reuse conditions | Useful France-specific adapter, including contract/location filters. |
| [USAJOBS](https://developer.usajobs.gov/guides/authentication) | Search API requires a key | US federal jobs; lower priority for an international remote frontend search. Check each announcement's hiring eligibility. |
| [JobTech JobSearch](https://jobsearch.api.jobtechdev.se/) | Official Swedish employment API endpoint | Promising country-specific source. Validate current authentication, license and search schema before implementing. |

## Employer boards, rather than global aggregators

[Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Lever Postings API](https://github.com/lever/postings-api), and [Ashby public job postings](https://developers.ashbyhq.com/docs/public-job-posting-api) expose published jobs for a specific employer board. They are particularly useful for US/European product companies, but are not global company-search APIs.

Implement an owner-curated employer watchlist with validated board identifiers, fixed provider hosts, bounded pagination and source attribution. Never accept arbitrary fetch URLs or crawl an unbounded list of companies. Keep applying on the employer's original page; application-submission endpoints are outside scope.

## Access restrictions and unresolved sources

- [We Work Remotely RSS](https://weworkremotely.com/remote-job-rss-feed) exists, but [API guidelines](https://weworkremotely.com/api-terms-and-guidelines) restrict competing job-search services and require routed application links. Automatic import remains deferred pending clarification of the intended private CRM use. A public feed alone is not a redistribution license.
- [LinkedIn](https://www.linkedin.com/legal/user-agreement) restricts unauthorized scraping and automated access. Keep a directory link and manual vacancy entry.
- Indeed, Glassdoor, Wellfound and EURES remain directory links. A suitable documented public read/search API with verified reuse conditions was not established in this review; this does not assert that no partner API exists. Do not implement a scraper or rely on an undocumented website endpoint.

## Recommended follow-up order

1. Add DOU/Djinni RSS with a bounded XML parser, entity-expansion protection and feed contract tests.
2. Add configurable provider-side keyword/country searches and resumable bounded cursor traversal. Show coverage/backfill progress and retain quotas across restarts; do not promise complete global coverage.
3. Add the employer watchlist for Greenhouse, Lever and Ashby.
4. Connect Adzuna and Jooble after keys/terms are available, then country-specific sources according to actual search needs.
5. Add optional employment type, explicit country/timezone restrictions, seniority and salary metadata. Preserve unknown values; never infer permission to work from "remote" or silently compare salaries across currencies/pay periods.

No paid account, partner agreement, provider credential or external message has been created. Hosting and automated applications remain deferred.
