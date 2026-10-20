# YouTube setup

The project uses YouTube's official OAuth flow and Data API. It never asks for a Google password and it never stores an OAuth token in the database.

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable **YouTube Data API v3**.
2. Configure the OAuth consent screen. For local testing, keep the app in testing mode and add your Google account as a test user.
3. Create an OAuth client of type **Web application**.
4. Add this exact authorized redirect URI: `http://localhost:4000/api/v1/integrations/youtube/callback`.
5. Copy the client ID, secret, and redirect URI into the local `.env` file.
6. Restart the API and dashboard, open **Accounts**, select the channel, and click **Connect YouTube**.

The callback validates the channel and saves the access/refresh tokens encrypted in `.data/platform-credentials.json` with restrictive local permissions. The file is ignored by Git. YouTube uploads remain `private` until the publication is explicitly approved.

Before public production publishing, complete Google's consent-screen and API-audit requirements.
