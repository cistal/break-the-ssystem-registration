# Break The System — Vercel deployment

This version hosts the page and an `/api/register` Vercel Function. The function writes submissions to a Google Sheet only after validating them on the server.

## Deploy

1. Create a Vercel account using the same Google account, then unzip this folder.
2. In PowerShell inside this folder, run:

   ```powershell
   npm.cmd install
   npx.cmd vercel --prod
   ```

3. When Vercel provides the production URL, open the Vercel dashboard for that project: **Settings → Environment Variables**. Add these three values for **Production**:

   - `GOOGLE_SHEET_ID` — the spreadsheet ID.
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — the complete, unmodified contents of the service-account JSON file.
   - `REGISTRATION_SHEET_NAME` — `Registrations`.

4. Redeploy the project:

   ```powershell
   npx.cmd vercel --prod
   ```

5. Submit a test registration and verify a new row appears in the `Registrations` tab.

## Security

Do not copy the service-account JSON into this project, a public folder, GitHub, or a chat. Store it only as a Vercel environment variable. The spreadsheet must be shared with the service account email as an **Editor**.
