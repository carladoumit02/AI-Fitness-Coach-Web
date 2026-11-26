# MOTION / LAB — AI Fitness Coach Web

A browser-based version of the EECE 490 fitness-coach project, based on Dimitri's **V2** Windows features and the **V3** account and scoring design.

**Repository:** https://github.com/carladoumit02/AI-Fitness-Coach-Web

## What is implemented

- Responsive Mac/Windows browser interface: dashboard, live workout studio, progress, leaderboard and admin accounts.
- Live webcam pose landmarks through **MediaPipe Pose Landmarker Web**: Lite for squats and push-ups; Full for planks.
- Experimental **joint-angle** repetition counters (squats and push-ups), plank alignment/hold timer and on-screen cues. Camera footage is kept on the user's device.
- Rating out of 100 and A–F grade, following the V3 Windows rule `round(form_quality × completion / 100)`.
- **Supabase** email/password accounts, private saved session history, shared leaderboards (per exercise/period), and permission-checked admin account deletion. Data is cloud-synced **only after** Supabase is configured.
- A preview mode is available without Supabase; it does not save accounts or scores.

### Scientific and product limitations

**IMPORTANT:** This browser port is an initial cross-platform website, not a complete translation of the original Windows app. The Web pose-feedback scores currently use heuristic joint-angle rules and are **not** predictions from the Python-trained Logistic Regression, SVM or Random Forest classifiers. The original Windows V2 automatic recognition, LSTM, voice, adaptive sessions, custom workouts and calibration are not yet fully ported. Live pose and scoring must be tested with real Mac and Windows webcams. Counters may miss/double-count repetitions; results are experimental and should not be used for injury prevention or medical guidance. The browser's self-reported ratings are not anti-cheat secure.

## Run locally (on Mac or Windows)

1. Install Node.js 20+.
2. In the project directory run `npm install` then `npm run dev`.
3. Open the localhost address displayed. In preview mode you can use the webcam without an account.
4. `npm test` checks scoring math and simple counters. `npm run build` produces `dist/` for hosting.

## Activate accounts, saved progress and admin controls

1. Create a Supabase project at https://supabase.com/dashboard (the project owner controls the account and billing).
2. Under **SQL Editor**, run **all of** `supabase/schema.sql` using the SQL Editor. This creates user profiles, workout history, Row Level Security (RLS), leaderboard and admin functions.
3. In Supabase **Project Settings → API Keys**, copy the **Project URL** and the **publishable/anon** key (NOT the `service_role` or `secret` key).
4. Paste these two public client configuration values into `src/config.js` and commit the file. Never put a service role key or DB password in the repo.
5. In Supabase **Authentication → URL Configuration**, set your deployed website as the Site URL and allow the production and local development URLs for email confirmation redirects.
6. Sign up through the deployed website and confirm your email if confirmation is enabled.
7. Set your own confirmed account to `admin` using the SQL Editor command provided at the end of `supabase/schema.sql`; replace the email with your actual login email. Do not create a hardcoded admin password.
8. Test with a separate non-admin account. Confirm that only an admin can list and delete users, and normal users cannot read other users' workout history.

Admin deletion permanently removes the account from Supabase Auth and cascades to its workout records. It requires an additional confirmation in the UI. Back up database data before real-world use.

## Deploy from GitHub to Vercel

1. Open https://vercel.com/new, sign in with GitHub and choose `carladoumit02/AI-Fitness-Coach-Web`.
2. The framework is **Vite**. Build command: `npm run build`. Output directory: `dist`.
3. Deploy. Vercel will provide a website URL over HTTPS. **Without configured Supabase**, accounts and leaderboard will remain in preview mode.
4. Allow this new URL in the Supabase Auth URL Configuration, then verify signup, sign-in, webcam permission, saved history, leaderboard, and deletion with test accounts.

### Privacy and permissions

- MediaPipe processes frames in the browser; the web application does **not** upload or save raw video.
- The external pose-model file is downloaded from Google's published model URL; the MediaPipe WebAssembly runtime is fetched from jsDelivr.
- Signed-in users can see leaderboard display names/scores, but their detailed session rows are private under RLS.
- Supabase **service_role** tokens must remain server-side; never commit them. Admin deletion is authorized inside a database function.
- Only the project owner should handle real-user privacy notices and data deletion; request consent before testing other people's camera footage.

## Test commands

```bash
npm test
npm run build
```

The application has been locally syntax/unit-tested in development, but deployment, authentication configuration and real webcam/device testing remain to be completed.
