# AI Fitness Coach

A browser-based fitness coaching project for **EECE 490**. Use a webcam to follow guided exercise sessions, track movement and form, and review progress. The website works on modern desktop browsers on macOS and Windows.

**Live site:** https://carladoumit02.github.io/AI-Fitness-Coach-Web/

## What the project does

- **Three supported exercises:** squats, push-ups, and forearm planks.
- **Live body tracking:** MediaPipe Pose Landmarker estimates body landmarks locally in the browser and provides movement-based feedback.
- **Automatic exercise completion:** repetitions or valid plank-hold seconds are counted toward a selected target. When a target is reached, the set ends without a manual stop.
- **Workout programs:** Beginner (10 squats, 5 push-ups, 20-second plank), Intermediate (15, 10, 40 seconds), and Advanced (25, 20, 60 seconds). Programs include rest, exercise transitions, and an overall summary.
- **Custom programs:** arrange the three exercises in a sequence with configurable repetitions, holds, and rest intervals.
- **Performance summary:** estimated form quality, completion percentage, numeric rating out of 100, and grade A–F.
- **Accounts and guest access:** visitors can try workouts without registering; registered users can save results and see their progress on multiple devices.
- **Leaderboard and administration:** signed-in users can compare ratings, while authorized administrators can manage and remove user accounts.
- **Additional tools:** pause/resume, opt-in voice guidance, movement summaries, and local landmark comparison/replay.
- **Privacy:** webcam footage is processed in the browser; raw camera video is not uploaded to the project database.

## How to use it

1. Open the live site and select **Continue as Guest** or **Create account**.
2. Choose an individual exercise or a Beginner, Intermediate, or Advanced program.
3. Position yourself so your body is visible. Allow camera access and follow the starting-position prompt and countdown.
4. Perform the exercise. The counter stops at the target; guided programs move to rest and the next exercise.
5. Review the rating and summary. Registered users can view saved workouts in **My progress** and appear in the leaderboard.

You can manually stop an exercise early; this is indicated as an early ending rather than a completed target.

## Technology

| Component | Technology |
|---|---|
| Website | Vanilla JavaScript, HTML, CSS, Vite |
| Pose estimation | MediaPipe Tasks Vision |
| Accounts and data | Supabase Auth + Postgres with Row Level Security |
| Hosting | GitHub Pages, deployed with GitHub Actions |
| Tests | Node.js built-in test runner |

## Run locally

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Run checks with:

```bash
npm test
npm run build
```

## Account and database setup

The live site's `src/config.js` contains **browser-safe** Supabase connection information only. Never commit database passwords, secret keys, or service-role keys.

For a new instance:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL Editor, then `supabase/feature_extensions.sql` if using custom program and preference sync.
3. Configure **Authentication → URL Configuration**. Set the Site URL to `https://carladoumit02.github.io/AI-Fitness-Coach-Web/` and add this exact address to the Redirect URLs. Add your localhost URL for development if needed.
4. Enable email/password sign-ups under **Authentication → Providers → Email**. If email confirmation is required, users must open the confirmation email before signing in.
5. Register a user, verify email if prompted, and then sign in.
6. To appoint an administrator, use the owner-only SQL example at the bottom of `supabase/schema.sql`. Ordinary registration never gives admin privileges.

If the email confirmation link leads to the wrong page, correct the Site URL and Redirect URLs in Supabase. The website requests a redirect to the current deployment address, but cannot override a disallowed redirect in Supabase settings.

The included RLS policies restrict personal history, and administrator operations enforce database-side authorization.

## Accuracy and limitations

This is an **educational prototype**, not a medical or certified exercise assessment. Browser pose estimation uses pretrained MediaPipe landmarks and experimental geometric rules for repetition counting and form quality. Classifier weights from the original desktop implementation are **not** loaded in the browser. Actual rep accuracy, camera handling, email confirmation, leaderboard behavior, and cross-browser performance should be tested on devices before a demonstration. Scores are experimental and should not be treated as injury-prevention guidance or tamper-proof competition results.

Guest sessions are not stored in Supabase. Program cloud sync requires the additional SQL schema; the site preserves core workout functionality when optional tables are missing.

## Deployment

GitHub Actions runs the tests, builds the Vite project, and publishes `dist/` to GitHub Pages on pushes to `main`.

[Open the live website](https://carladoumit02.github.io/AI-Fitness-Coach-Web/)
