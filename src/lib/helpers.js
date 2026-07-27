const FRIENDLY_ERROR_MESSAGES = {
  "auth/admin-restricted-operation":
    "Anonymous sign-in is disabled or account creation is restricted in Firebase Authentication.",
  "auth/invalid-api-key":
    "The Firebase API key is missing or invalid. Check the VITE_FIREBASE_* values in your .env file.",
  "auth/network-request-failed":
    "The Firebase request could not reach the server. Check your internet connection and Firebase configuration.",
  "auth/invalid-credential":
    "The email or password is incorrect.",
  "auth/operation-not-allowed":
    "This sign-in method is disabled in Firebase Authentication.",
  "auth/unauthenticated":
    "Your student session could not be verified. Refresh the page and start again.",
  "permission-denied":
    "Firebase blocked this request. Deploy the included firestore.rules file, then try again.",
  "firestore/permission-denied":
    "Firebase blocked this request. Deploy the included firestore.rules file, then try again.",
  "not-found": "The requested quiz or attempt was not found.",
  "already-exists":
    "This quiz attempt already exists.",
  "failed-precondition":
    "The quiz is not ready. Open its Questions page in the admin panel once, then try again.",
  unavailable:
    "Firebase is temporarily unavailable. Check your internet connection and try again.",
};

function cleanFirebaseMessage(message) {
  return String(message || "")
    .replace(/^Firebase:\s*/i, "")
    .replace(/^FirebaseError:\s*/i, "")
    .replace(/^FirestoreError:\s*/i, "")
    .replace(/^\[[^\]]+\]\s*/i, "")
    .trim();
}

export function readableError(
  error,
  fallback = "Something went wrong. Please try again.",
) {
  const code = String(error?.code || "").trim();
  const detailsMessage =
    typeof error?.details === "string"
      ? error.details
      : error?.details?.message || error?.details?.reason || "";
  const cleanedMessage = cleanFirebaseMessage(
    detailsMessage || error?.message,
  );

  if (cleanedMessage) return cleanedMessage;
  if (FRIENDLY_ERROR_MESSAGES[code]) return FRIENDLY_ERROR_MESSAGES[code];
  return fallback;
}

export function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function createQuizCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(6);
  crypto.getRandomValues(values);
  return Array.from(
    values,
    (value) => alphabet[value % alphabet.length],
  ).join("");
}

export function csvEscape(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replaceAll('"', '""')}"`;
}
