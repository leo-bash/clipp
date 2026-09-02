# YouTube setup

The official YouTube adapter implements OAuth exchange/refresh, account validation, private-by-default resumable upload, status and basic statistics retrieval. Configure the runtime client/access credentials in `.env`; missing credentials select the mock publisher. Keep uploads private or unlisted during verification and complete Google's API audit requirements before enabling public production publishing.
