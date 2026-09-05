# Team dashboard production deployment

Production is https://team.finnovate.in/team/admin.html, served by Apache.
GitHub Pages is a separate copy. Pushing to GitHub does not update this host.

- Transport: SFTP
- Host: 147.93.96.195
- User: pranobteam
- SFTP working directory: /var/www/team
- Dashboard path: /var/www/team/team/admin.html
- Supabase project: uzhbqarchcbrwwfamuum

Use credentials supplied through the session or a secure credential store. Never
commit passwords or authenticated admin URLs.

Before uploading, download the current production file and compare it with the
release. Production and repository files may contain different unrelated changes.
Upload to a temporary filename, download it to verify its contents, then rename
it over admin.html. Verify the HTML from the production HTTPS URL and test an
authenticated dashboard load.

Apply only the migrations included in the release. The unrelated
202607300001_temp_schema_introspect.sql migration remains unapplied; do not
include it in an ordinary database push.

## Dashboard timeout fix, 2026-09-05

The production file had an 18-second client timeout and did not recognize client
timeouts for recovery. Its authenticated dashboard API request took 19.607 seconds.

Applied the on-demand dashboard changes from commit 7482fe3 to the production
file, plus the repository's timeout classification and 33-second primary request
budget. Preserved the production file's unrelated directory/user-creation code.

Applied 202609050002_dashboard_history_intervals.sql to replace repeated scans
of historical EOD updates with date intervals. The complete query output matched
in a repeatable-read comparison, and authenticated API output also matched after
excluding generatedAt. The synthetic SQL regression covers same-day exclusion,
latest submission ordering, gaps, and employee/task isolation.

Observed after deployment, one signed-in browser run:
- Dashboard API: 5.313 seconds (before: 19.607 seconds)
- Dashboard ready from navigation: 6.256 seconds
- Streaks tab: 1.839 seconds; immediate revisit made no new streak request
- No secondary-section requests during initial load and no JavaScript errors

Six Node regression checks and the SQL regression passed. The repository-wide
npm smoke suite could not start because @playwright/test was not installed.
