# Scope and feature checklist

This project focuses on **three** exercises: squats, push-ups, and forearm planks. The hosted website combines an exercise coaching interface with an account-based progress and leaderboard system.

## Core exercise modes

- Squats — body-landmark knee-angle rep counting and form cues.
- Push-ups — elbow-angle rep counting and form cues.
- Forearm planks — alignment checks and valid-hold timer.

The web implementation uses experimental geometric rules rather than desktop-trained classifiers. Movement detection and quality scores still need video and webcam validation.

## Guided programs

| Program | Squats | Push-ups | Plank | Rest |
|---|---:|---:|---:|---:|
| Beginner | 10 | 5 | 20 sec | 30 sec |
| Intermediate | 15 | 10 | 40 sec | 25 sec |
| Advanced | 25 | 20 | 60 sec | 20 sec |

- Program flow: select program → check starting position → three-second countdown → target completed automatically → rest/skip → next exercise → results.
- Custom programs can rearrange those **three exercises** with configurable targets and rests.
- A manual early-stop action is available and should not claim a completed workout.
- Individual and full-program summaries show numeric grades and completion percentages.

## User account and usability requirements

- Register, confirm email when required, sign in, sign out, and resend email confirmation.
- Enter **Continue as Guest** without registration; do not save guest scores to the cloud.
- Members' saved session history and progress are private, while public leaderboard entries display only names and rankings.
- Administrator rights are enforced in the database, not by hiding buttons.
- Both macOS and Windows browsers can load the deployed website, subject to webcam permissions.
- Camera footage remains on the device; session analysis is experimental.

## Testing and remaining configuration

- Automated build and unit tests check score math, workout programs, and target completion. Real-camera rep accuracy and onboarding must still be checked manually.
- Supabase Authentication → URL Configuration must allow the deployed GitHub Pages address. Confirmation emails may be required before login.
- Run the optional `supabase/feature_extensions.sql` schema for registered custom-program and preference sync.
- Preserve the original desktop code and datasets separately; do not publish sensitive data.

See [README](../README.md) for current usage and setup instructions.
