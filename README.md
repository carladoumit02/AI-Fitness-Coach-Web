# MOTION / LAB — AI Fitness Coach

A browser-based fitness coaching application developed for **EECE 490, Project 16**. It uses live webcam pose estimation to guide exercises, count movements, rate workout completion and form, and track personal progress. The interface supports modern desktop browsers on macOS and Windows.

**[Open the website](https://carladoumit02.github.io/AI-Fitness-Coach-Web/)** · **[Short link](https://tinyurl.com/motionlab490)**

## Features

### Exercise tracking and coaching

- **Three exercises:** squats, push-ups, and forearm planks.
- **Real-time pose estimation:** body landmarks are processed locally in the browser with MediaPipe Tasks Vision.
- **Exercise-specific tracking:** squat and push-up repetitions, plus valid forearm-plank hold time, are estimated from body geometry.
- **Automatic target completion:** sets stop when their rep or valid-hold target is reached; users can also end a workout early.
- **Starting-position checks and countdown:** the interface guides users into position before active counting begins.
- **Distance-friendly feedback:** large, high-contrast instructions appear over the camera view so the user can read them while standing back.
- **Optional spoken coaching:** voice is **off by default for new visitors**, can be toggled in the workout chooser or studio, and is remembered on that browser. The app prefers an available US English voice, then UK English. Actual voice/accent depends on installed browser/system voices.
- **Fullscreen camera:** the control changes between **Maximize** and **Minimize** as fullscreen is entered and exited, including when pressing Esc.
- **Pause and resume:** available in both the workout studio and fullscreen view. Pausing suspends pose processing/counting and excludes paused time from the elapsed workout timer and countdown. Switching to a hidden browser tab pauses an active workout.

### Workout choices

Select **Start training** to choose between:

- **Guided workout:** one of the three ready-made programs below, with transitions, rest periods and a full-program summary.
- **Create my own:** build a custom sequence of squats, push-ups and planks, choose repetitions/hold duration and set rest time.

| Program | Squats | Push-ups | Plank | Rest between exercises |
|---|---:|---:|---:|---:|
| Beginner | 10 reps | 5 reps | 20 sec | 30 sec |
| Intermediate | 15 reps | 10 reps | 40 sec | 25 sec |
| Advanced | 25 reps | 20 reps | 60 sec | 20 sec |

Individual exercise cards are also available. Custom programs support up to 12 sets using the same three exercise types.

### Results, accounts and progress

- Exercise and program summaries show estimated form quality, target-completion percentage, a numeric score out of 100 and a letter grade.
- **Continue as Guest** lets visitors try exercises without creating an account. Guest workouts do not enter the shared database or leaderboard.
- **Sign in / Create account** uses Supabase email/password authentication, with confirmation-email guidance and a resend option.
- Signed-in users can save sessions, review workout history and participate in a shared exercise leaderboard.
- Authorized administrators can manage registered accounts, subject to database permissions.
- Local JSON result export, progress insights, optional adaptive settings, and landmark replay/comparison tools are available.

## How to use

1. Open the website, then **sign in** or select **Continue as Guest**.
2. Click **Start training** and choose a **Guided workout** or **Create my own**, or select an individual exercise card.
3. If wanted, turn on **Spoken coaching**. On-screen visual instructions work independently of audio.
4. Choose **Start camera** and allow browser camera permission. Stand far enough back to keep your body visible.
5. Follow the positioning cues and countdown, then complete the exercise. The set ends automatically at its target.
6. Use **Pause / Resume** when needed, including from fullscreen. After the session, review the grade and completion summary.

An early manual stop is distinguished from reaching the selected target.

## Performance and reliability improvements

The current web code includes:

- Local delivery of matching MediaPipe WebAssembly files during the site build.
- A pose detector reused between compatible workout sessions, avoiding unnecessary repeated model initialization; changing between Lite and Full models still requires a model switch.
- Reused canvas drawing utilities, with canvas resizing only when video dimensions actually change.
- Throttled updates for secondary live metrics to reduce unnecessary interface work.
- No continuing pose-processing animation loop while the workout is paused.
- Pause-aware elapsed time and countdown handling; automatic pausing when the browser tab becomes hidden.
- A camera preview during model startup and more informative messages when webcam or model initialization fails.

These are **implementation improvements**, not a measured guarantee of a particular frame rate or lag-free performance.

## Technology

| Area | Technology |
|---|---|
| Web application | HTML, CSS, JavaScript, Vite |
| Pose estimation | MediaPipe Tasks Vision |
| Authentication and saved data | Supabase Auth + PostgreSQL with Row Level Security |
| Hosting | GitHub Pages |
| Continuous deployment | GitHub Actions |
| Automated checks | Node.js test runner and Vite production build |

## Run locally

Requires a recent version of Node.js (the deployment workflow uses Node.js 22).

```bash
npm install
npm run dev
```

Open the URL provided by Vite. To check the source:

```bash
npm test
npm run build
```

The build script copies the MediaPipe WebAssembly resources from the installed package into the published site.

## Supabase setup

The app's public `src/config.js` contains browser-safe connection values. Never commit a service-role key, private API key, database password or user credentials.

To configure a fresh instance:

1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor.
2. Run `supabase/feature_extensions.sql` for custom-program, program-history and preference cloud storage.
3. Under **Authentication → URL Configuration**, allow the actual deployed website URL as both the Site URL and a redirect URL.
4. Enable the email/password provider and configure confirmation-email delivery as appropriate.
5. Test account creation, email confirmation, login, saved workouts and leaderboard operations with real accounts.
6. Grant administrator access using the database-side setup described in `supabase/schema.sql`; public registration does not grant admin privileges.

The website requests an email-confirmation redirect back to its deployment URL, but the Supabase dashboard must permit that URL. Registered users may be required to confirm their email before sign-in.

## Verification status and limitations

**Automated verification:** the most recent GitHub Actions run before this README update passed its tests, production build and GitHub Pages deployment. Tests cover scoring, preset programs, target completion, framing cues and pause/resume clock calculations.

**Still requires real-device verification:** repeated workout sessions, camera frame rate, voice availability/accent, long-running memory and CPU usage, rep-count accuracy on different body types/lighting, fullscreen interactions, and end-to-end Supabase registration and email delivery.

This is an **educational prototype**, not medical or certified fitness guidance. The web version uses MediaPipe landmarks and experimental geometric movement rules; desktop-trained exercise classification models are not loaded by this site. Scores are estimates and are not tamper-proof measures of athletic performance. Camera video is processed locally and is not uploaded to the project's database.

## Deployment

Changes pushed to `main` trigger GitHub Actions to run tests, build the Vite application and publish the output to GitHub Pages. The public URL remains the same after deployment, so previously shared links generally do not need to be resent. Visitors who already have the page open may need to refresh.

**Website:** https://carladoumit02.github.io/AI-Fitness-Coach-Web/  
**Short link:** https://tinyurl.com/motionlab490
