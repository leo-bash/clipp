# TikTok setup

The project uses TikTok Login Kit and the official Content Posting API. It does not use browser automation or ask for a TikTok password.

1. Open [TikTok for Developers](https://developers.tiktok.com/) and create an app.
2. Add **Login Kit** and configure this exact Web redirect URI: `http://localhost:4000/api/v1/integrations/tiktok/callback`.
3. Add **Content Posting API** and request approval for `video.upload`. Request `video.publish` only if direct posting is later needed.
4. Copy the client key, secret, and redirect URI into the local `.env` file.
5. Restart the API and dashboard, open **Accounts**, select the channel, and click **Connect TikTok**.

The initial configuration is deliberately `TIKTOK_MODE=UPLOAD_DRAFT`: the video is transferred to TikTok for review and the final post is completed inside TikTok. Tokens are saved encrypted in `.data/platform-credentials.json`, excluded from Git, and never displayed in the dashboard.

`DIRECT_POST` remains available later, with the configured fallback to draft when the required scope is not authorized. No browser-upload workaround is permitted.
