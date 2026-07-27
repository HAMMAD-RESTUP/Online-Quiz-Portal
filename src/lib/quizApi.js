import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";

const allowedCheatTypes = new Set([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "page_reload",
  "back_button",
  "copy_attempt",
  "paste_attempt",
  "context_menu",
  "keyboard_shortcut",
]);

function appError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, fieldName, maxLength = 120) {
  const cleanedValue = String(value ?? "").trim().replace(/\s+/g, " ");

  if (!cleanedValue) {
    throw appError("invalid-argument", `${fieldName} is required.`);
  }

  if (cleanedValue.length > maxLength) {
    throw appError(
      "invalid-argument",
      `${fieldName} must be ${maxLength} characters or fewer.`,
    );
  }

  return cleanedValue;
}

function ensureAuthenticatedUser() {
  const user = auth.currentUser;

  if (!user) {
    throw appError(
      "auth/unauthenticated",
      "Your student session is missing. Refresh the page and start again.",
    );
  }

  return user;
}

function shuffle(items) {
  const cloned = [...items];

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[randomIndex]] = [
      cloned[randomIndex],
      cloned[index],
    ];
  }

  return cloned;
}

function validateQuestionSnapshot(questionSnapshot) {
  if (!questionSnapshot.exists()) {
    throw appError("not-found", "Question not found.");
  }

  const question = questionSnapshot.data();
  const optionsAreValid =
    Array.isArray(question?.options) &&
    question.options.length === 4 &&
    question.options.every(
      (option) => typeof option === "string" && option.trim().length > 0,
    );

  if (
    !question ||
    typeof question.text !== "string" ||
    !question.text.trim() ||
    !optionsAreValid
  ) {
    throw appError(
      "failed-precondition",
      `Question ${questionSnapshot.id} has invalid data. Ask the admin to open and save it again.`,
    );
  }

  return {
    ...question,
    text: question.text.trim(),
    options: question.options.map((option) => option.trim()),
    timeLimitSec: Math.max(
      5,
      Math.min(3600, Number(question.timeLimitSec) || 30),
    ),
    marks: Math.max(1, Number(question.marks) || 1),
  };
}

function makeQuestionPayload(
  questionSnapshot,
  displayOrder,
  deadlineMs,
  position,
  total,
) {
  const question = validateQuestionSnapshot(questionSnapshot);
  const safeOrder =
    Array.isArray(displayOrder) &&
    displayOrder.length === 4 &&
    displayOrder.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 3,
    )
      ? displayOrder
      : [0, 1, 2, 3];

  return {
    questionId: questionSnapshot.id,
    text: question.text,
    options: safeOrder.map((index) => question.options[index]),
    timeLimitSec: question.timeLimitSec,
    marks: question.marks,
    deadlineMs,
    questionNumber: position + 1,
    totalQuestions: total,
  };
}

function privateStudentResult() {
  return {
    showScore: false,
    submitted: true,
  };
}

async function getAttemptState(attemptId, uid) {
  const attemptRef = doc(db, "attempts", attemptId);
  const attemptSnapshot = await getDoc(attemptRef);

  if (!attemptSnapshot.exists()) {
    throw appError("not-found", "Quiz attempt not found.");
  }

  const attempt = attemptSnapshot.data();

  if (attempt.studentUid !== uid) {
    throw appError(
      "permission-denied",
      "This roll number has already been used for this quiz.",
    );
  }

  const quizInfo = {
    title: attempt.quizTitle || "Quiz",
    subject: attempt.subject || "",
  };

  if (attempt.status === "completed") {
    return {
      attemptId,
      done: true,
      result: privateStudentResult(),
      quiz: quizInfo,
    };
  }

  if (
    !attempt.quizId ||
    !Array.isArray(attempt.questionOrder) ||
    attempt.questionOrder.length === 0 ||
    !attempt.currentQuestionId ||
    !Number.isInteger(attempt.currentIndex)
  ) {
    throw appError(
      "failed-precondition",
      "This quiz attempt is invalid. Ask the admin to delete it, then start again.",
    );
  }

  const questionSnapshot = await getDoc(
    doc(
      db,
      "quizzes",
      attempt.quizId,
      "questions",
      attempt.currentQuestionId,
    ),
  );
  const deadlineMs = attempt.currentDeadline?.toMillis
    ? attempt.currentDeadline.toMillis()
    : Date.now();

  return {
    attemptId,
    done: false,
    quiz: quizInfo,
    question: makeQuestionPayload(
      questionSnapshot,
      attempt.displayOrders?.[attempt.currentQuestionId],
      deadlineMs,
      attempt.currentIndex,
      attempt.questionOrder.length,
    ),
  };
}

export async function startQuizAttempt({
  quizCode,
  studentName,
  rollNumber,
}) {
  const user = ensureAuthenticatedUser();
  const cleanedQuizCode = requiredText(quizCode, "Quiz code", 24)
    .toUpperCase()
    .replace(/\s/g, "");
  const cleanedStudentName = requiredText(studentName, "Student name", 80);
  const cleanedRollNumber = requiredText(rollNumber, "Roll number", 40);
  const normalizedRollNumber = cleanedRollNumber.toLowerCase();

  const quizQuery = query(
    collection(db, "quizzes"),
    where("code", "==", cleanedQuizCode),
    where("isActive", "==", true),
    limit(2),
  );
  const quizQuerySnapshot = await getDocs(quizQuery);

  if (quizQuerySnapshot.empty) {
    throw appError(
      "not-found",
      "Quiz code is invalid or the quiz is not active.",
    );
  }

  if (quizQuerySnapshot.size > 1) {
    throw appError(
      "failed-precondition",
      "Duplicate quiz code found. Ask the admin to change one of the codes.",
    );
  }

  const quizSnapshot = quizQuerySnapshot.docs[0];
  const quiz = quizSnapshot.data();
  let questionsSnapshot;

  try {
    questionsSnapshot = await getDocs(
      query(
        collection(db, "quizzes", quizSnapshot.id, "questions"),
        where("studentReadable", "==", true),
      ),
    );
  } catch (error) {
    if (String(error?.code || "").includes("permission-denied")) {
      throw appError(
        "failed-precondition",
        "This quiz still uses the old question format. Ask the admin to open its Questions page once, then try again.",
      );
    }
    throw error;
  }

  if (questionsSnapshot.empty) {
    throw appError(
      "failed-precondition",
      Number(quiz.questionCount) > 0
        ? "This quiz still uses the old question format. Ask the admin to open its Questions page once, then try again."
        : "This quiz has no questions.",
    );
  }

  const questionMap = new Map();
  const orderedQuestionIds = [];
  let totalMarks = 0;

  const sortedQuestionDocs = [...questionsSnapshot.docs].sort(
    (left, right) =>
      (Number(left.data().order) || 0) - (Number(right.data().order) || 0),
  );

  sortedQuestionDocs.forEach((questionSnapshot) => {
    const question = validateQuestionSnapshot(questionSnapshot);
    questionMap.set(questionSnapshot.id, questionSnapshot);
    orderedQuestionIds.push(questionSnapshot.id);
    totalMarks += question.marks;
  });

  const questionOrder = quiz.shuffleQuestions
    ? shuffle(orderedQuestionIds)
    : orderedQuestionIds;
  const displayOrders = {};

  questionOrder.forEach((questionId) => {
    displayOrders[questionId] = quiz.shuffleOptions
      ? shuffle([0, 1, 2, 3])
      : [0, 1, 2, 3];
  });

  const firstQuestionId = questionOrder[0];
  const firstQuestionSnapshot = questionMap.get(firstQuestionId);
  const firstQuestion = validateQuestionSnapshot(firstQuestionSnapshot);
  const nowMs = Date.now();
  const firstDeadlineMs = nowMs + firstQuestion.timeLimitSec * 1000;
  // Use a new Firestore document ID for every quiz start.
  // The roll number is stored as student information only; it no longer
  // blocks retakes or creates a fixed attempt ID.
  const attemptRef = doc(collection(db, "attempts"));
  const attemptId = attemptRef.id;

  await setDoc(attemptRef, {
    quizId: quizSnapshot.id,
    quizCode: cleanedQuizCode,
    quizTitle: quiz.title || "Quiz",
    subject: quiz.subject || "",
    studentUid: user.uid,
    studentName: cleanedStudentName,
    rollNumber: cleanedRollNumber,
    normalizedRollNumber,
    status: "in_progress",
    questionOrder,
    displayOrders,
    currentIndex: 0,
    currentQuestionId: firstQuestionId,
    currentQuestionStartedAt: Timestamp.fromMillis(nowMs),
    currentDeadline: Timestamp.fromMillis(firstDeadlineMs),
    totalMarks,
    cheatCount: 0,
    cheatTypes: [],
    isSuspicious: false,
    startedAt: serverTimestamp(),
    submittedAt: null,
    appMode: "spark-firestore",
  });

  return {
    attemptId,
    done: false,
    quiz: {
      title: quiz.title || "Quiz",
      subject: quiz.subject || "",
    },
    question: makeQuestionPayload(
      firstQuestionSnapshot,
      displayOrders[firstQuestionId],
      firstDeadlineMs,
      0,
      questionOrder.length,
    ),
  };
}

export async function resumeQuizAttempt(attemptOrPayload) {
  const user = ensureAuthenticatedUser();
  const attemptId =
    typeof attemptOrPayload === "string"
      ? attemptOrPayload
      : attemptOrPayload?.attemptId;

  return getAttemptState(
    requiredText(attemptId, "Attempt ID", 160),
    user.uid,
  );
}

export async function submitQuizAnswer(
  payloadOrAttemptId,
  questionIdArgument,
  selectedIndexArgument,
  reasonArgument = "manual",
) {
  const user = ensureAuthenticatedUser();
  const isObjectPayload =
    payloadOrAttemptId && typeof payloadOrAttemptId === "object";
  const attemptId = requiredText(
    isObjectPayload ? payloadOrAttemptId.attemptId : payloadOrAttemptId,
    "Attempt ID",
    160,
  );
  const questionId = requiredText(
    isObjectPayload ? payloadOrAttemptId.questionId : questionIdArgument,
    "Question ID",
    160,
  );
  const selectedIndex = isObjectPayload
    ? payloadOrAttemptId.selectedIndex
    : selectedIndexArgument;
  const reason = isObjectPayload
    ? payloadOrAttemptId.reason || "manual"
    : reasonArgument;
  const normalizedSelectedIndex =
    selectedIndex === null ||
    selectedIndex === undefined ||
    selectedIndex === ""
      ? null
      : Number(selectedIndex);

  if (
    normalizedSelectedIndex !== null &&
    (!Number.isInteger(normalizedSelectedIndex) ||
      normalizedSelectedIndex < 0 ||
      normalizedSelectedIndex > 3)
  ) {
    throw appError(
      "invalid-argument",
      "Selected option must be 0, 1, 2, 3 or empty.",
    );
  }

  const attemptRef = doc(db, "attempts", attemptId);

  return runTransaction(db, async (transaction) => {
    const attemptSnapshot = await transaction.get(attemptRef);

    if (!attemptSnapshot.exists()) {
      throw appError("not-found", "Quiz attempt not found.");
    }

    const attempt = attemptSnapshot.data();

    if (attempt.studentUid !== user.uid) {
      throw appError(
        "permission-denied",
        "This attempt belongs to another student.",
      );
    }

    if (attempt.status === "completed") {
      return {
        attemptId,
        done: true,
        result: privateStudentResult(),
      };
    }

    if (attempt.currentQuestionId !== questionId) {
      throw appError(
        "failed-precondition",
        "This question is no longer active. The current question will be restored.",
      );
    }

    const currentQuestionRef = doc(
      db,
      "quizzes",
      attempt.quizId,
      "questions",
      questionId,
    );
    const currentQuestionSnapshot = await transaction.get(currentQuestionRef);
    const currentQuestion = validateQuestionSnapshot(currentQuestionSnapshot);
    const answerRef = doc(attemptRef, "answers", questionId);
    const existingAnswerSnapshot = await transaction.get(answerRef);

    if (existingAnswerSnapshot.exists()) {
      throw appError(
        "already-exists",
        "This answer has already been submitted.",
      );
    }

    const nextIndex = attempt.currentIndex + 1;
    const hasNextQuestion = nextIndex < attempt.questionOrder.length;
    let nextQuestionId = null;
    let nextQuestionSnapshot = null;
    let nextQuestion = null;

    if (hasNextQuestion) {
      nextQuestionId = attempt.questionOrder[nextIndex];
      nextQuestionSnapshot = await transaction.get(
        doc(
          db,
          "quizzes",
          attempt.quizId,
          "questions",
          nextQuestionId,
        ),
      );
      nextQuestion = validateQuestionSnapshot(nextQuestionSnapshot);
    }

    const nowMs = Date.now();
    const deadlineMs = attempt.currentDeadline?.toMillis
      ? attempt.currentDeadline.toMillis()
      : nowMs;
    const timedOut = nowMs > deadlineMs + 2000;
    const hasSelection =
      Number.isInteger(normalizedSelectedIndex) && !timedOut;
    const displayOrder = attempt.displayOrders?.[questionId] || [0, 1, 2, 3];
    const originalSelectedIndex = hasSelection
      ? displayOrder[normalizedSelectedIndex]
      : null;

    transaction.set(answerRef, {
      questionId,
      studentUid: user.uid,
      selectedDisplayIndex: hasSelection ? normalizedSelectedIndex : null,
      selectedOriginalIndex: originalSelectedIndex,
      timedOut,
      clientReason: String(reason || "manual").slice(0, 40),
      submittedAt: serverTimestamp(),
    });

    if (!hasNextQuestion) {
      transaction.update(attemptRef, {
        status: "completed",
        currentQuestionId: null,
        currentDeadline: null,
        submittedAt: serverTimestamp(),
      });

      return {
        attemptId,
        done: true,
        result: privateStudentResult(),
      };
    }

    const nextStartedAtMs = Date.now();
    const nextDeadlineMs =
      nextStartedAtMs + nextQuestion.timeLimitSec * 1000;

    transaction.update(attemptRef, {
      currentIndex: nextIndex,
      currentQuestionId: nextQuestionId,
      currentQuestionStartedAt: Timestamp.fromMillis(nextStartedAtMs),
      currentDeadline: Timestamp.fromMillis(nextDeadlineMs),
    });

    return {
      attemptId,
      done: false,
      question: makeQuestionPayload(
        nextQuestionSnapshot,
        attempt.displayOrders?.[nextQuestionId],
        nextDeadlineMs,
        nextIndex,
        attempt.questionOrder.length,
      ),
    };
  });
}

export async function recordCheatEvent(payloadOrAttemptId, typeArgument) {
  const user = ensureAuthenticatedUser();
  const isObjectPayload =
    payloadOrAttemptId && typeof payloadOrAttemptId === "object";
  const attemptId = requiredText(
    isObjectPayload ? payloadOrAttemptId.attemptId : payloadOrAttemptId,
    "Attempt ID",
    160,
  );
  const type = requiredText(
    isObjectPayload
      ? payloadOrAttemptId.type || payloadOrAttemptId.eventType
      : typeArgument,
    "Event type",
    40,
  );

  if (!allowedCheatTypes.has(type)) {
    throw appError("invalid-argument", "Unsupported activity event.");
  }

  const attemptRef = doc(db, "attempts", attemptId);
  const eventRef = doc(collection(attemptRef, "cheatEvents"));

  await runTransaction(db, async (transaction) => {
    const attemptSnapshot = await transaction.get(attemptRef);

    if (!attemptSnapshot.exists()) {
      throw appError("not-found", "Quiz attempt not found.");
    }

    const attempt = attemptSnapshot.data();

    if (attempt.studentUid !== user.uid) {
      throw appError(
        "permission-denied",
        "This attempt belongs to another student.",
      );
    }

    if (attempt.status !== "in_progress") return;

    const nextTypes = Array.from(
      new Set([...(attempt.cheatTypes || []), type]),
    );

    transaction.set(eventRef, {
      type,
      studentUid: user.uid,
      questionId: attempt.currentQuestionId || null,
      serverAt: serverTimestamp(),
    });
    transaction.update(attemptRef, {
      cheatCount: (Number(attempt.cheatCount) || 0) + 1,
      cheatTypes: nextTypes,
      isSuspicious: true,
      lastCheatAt: serverTimestamp(),
    });
  });

  return { recorded: true };
}

export const startAttempt = startQuizAttempt;
export const resumeAttempt = resumeQuizAttempt;
export const submitAnswer = submitQuizAnswer;
