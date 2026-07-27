# Firebase Quiz System — Spark Plan Edition

This version runs without Cloud Functions and does not require the Blaze plan.

## Services used

- React/Vite frontend
- Firebase Authentication
  - Email/Password for the admin
  - Anonymous sign-in for students
- Cloud Firestore
- No Cloud Functions
- Firebase Hosting is optional

## Important Spark-plan design

Students read only public question data and submit their selected option to Firestore.
Correct answers are stored separately inside:

```text
quizzes/{quizId}/answerKeys/{questionId}
```

Only a non-anonymous admin account can read this collection. Scores are calculated in the admin Results page. Students receive a submission confirmation but not an instant score.

## First-time setup

1. Enable **Email/Password** and **Anonymous** inside Firebase Authentication.
2. Create the admin account inside **Authentication → Users**.
3. Keep `.env` with `VITE_USE_EMULATORS=false` to use live Firebase data from localhost.
4. Install packages:

```bash
npm install
```

5. Deploy only Firestore rules. This works on the Spark plan:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project quiz-system-7a57e
```

Firebase Hosting and Cloud Functions are not deployed by that command.

You can also open Firebase Console → Firestore Database → Rules, paste the contents of `firestore.rules`, and click **Publish**.

## Existing quizzes created by the old version

Open each existing quiz's **Questions** page once while logged in as admin. The app automatically:

- moves `correctIndex` into the admin-only `answerKeys` collection;
- removes `correctIndex` from the public question document;
- marks the quiz as Spark-schema compatible.

After that, activate the quiz and test it from the student page.

## Run locally with live Firebase data

Keep:

```env
VITE_USE_EMULATORS=false
```

Then run:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Firestore structure

```text
quizzes/{quizId}
quizzes/{quizId}/questions/{questionId}
quizzes/{quizId}/answerKeys/{questionId}

attempts/{attemptId}
attempts/{attemptId}/answers/{questionId}
attempts/{attemptId}/cheatEvents/{eventId}
```

## Security limitation

Without a trusted server, browser timers and anti-cheat signals cannot be made fully tamper-proof. The answer key remains hidden from anonymous students, and final scoring is performed only in the authenticated admin panel.
