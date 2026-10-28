# FoundIt — React + Express + SQLite demo

## What is included
- React/Vite normal-user interface
- Node.js + Express API
- SQLite database stored at `server/data/foundit.db`
- Item reports and optional report photos
- Simulated users you can switch between
- Private conversation records for a claimant and finder
- Text messages and image evidence attachments (5 MB max)
- Finder-only approve / request-more-proof / reject decisions
- Return confirmation after approval

## Requirements
- Node.js 20.19+ or 22.12+ recommended (Vite 7 requirement)
- npm

## Run it
1. Extract this ZIP.
2. Open the extracted `foundit-sqlite` folder in VS Code.
3. In the terminal, run:
   ```bash
   npm install
   npm run dev
   ```
4. Open the Vite URL printed in the terminal (usually `http://127.0.0.1:5173`).

The Vite server proxies `/api` and `/uploads` to the Express server on port 3001.
Keep the terminal running while using the app.

## Demo accounts
Use the top-right dropdown to switch identities:
- Alex Finder
- Jamie Claimant
- Taylor Student

Example demo:
1. Select **Alex Finder** and locate the found Black Smartphone report.
2. Switch to **Jamie Claimant**, browse the same found report, and click **Message finder**.
3. Send text and attach an image as proof.
4. Switch back to **Alex Finder** and open Messages.
5. Review the evidence, then approve, request more proof, or reject.
6. If approved, either participant can confirm the item return.

## Database and uploaded images
- SQLite database: `server/data/foundit.db` (created on first run)
- Uploaded images: `server/uploads/`
- Do not delete these folders if you want to preserve the demo data.

To reset the demo database, stop the server, delete `server/data/foundit.db` plus any `server/data/foundit.db-*` files, then restart the app. This re-seeds the sample users and reports. Existing uploaded images are not automatically deleted.

## Important limitations
This is a local classroom prototype, not a production-ready app:
- The role switcher simulates accounts; there is no password login or verified identity.
- The API checks that the selected demo user is a conversation participant and only the finder can make claim decisions, but a public demo-user selector is not authentication.
- Uploads are stored on the local computer and served by Express; they are not protected by real account authentication.
- The app is intended for one developer computer. To support real users on different devices, deploy the backend and database to a server, add authentication and authorization, and secure image access.
- Evidence photos can help but do not prove ownership on their own. Do not upload passwords, PINs, or sensitive identity documents.
