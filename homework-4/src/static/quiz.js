let questions = [];
let selectedAnswers = [];
let currentIndex = 0;
let playerName = "Anonymous";

const landingScreen = document.getElementById("landing-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");
const leaderboardScreen = document.getElementById("leaderboard-screen");
const questionContainer = document.getElementById("question-container");
const submitBtn = document.getElementById("submit-btn");
const scoreDisplay = document.getElementById("score-display");
const leaderboardList = document.getElementById("leaderboard-list");

function showScreen(screen) {
  [landingScreen, quizScreen, resultScreen, leaderboardScreen].forEach((s) =>
    s.classList.add("hidden")
  );
  screen.classList.remove("hidden");
}

async function startQuiz() {
  const nameInput = document.getElementById("name-input");
  playerName = nameInput.value.trim() || "Anonymous";

  const res = await fetch("/api/questions");
  questions = await res.json();
  selectedAnswers = new Array(questions.length).fill(-1);
  currentIndex = 0;

  showScreen(quizScreen);
  renderQuestion();
}

function renderQuestion() {
  questionContainer.innerHTML = "";
  submitBtn.classList.add("hidden");

  questions.forEach((q, qIndex) => {
    const block = document.createElement("div");
    block.className = "question-block";

    const title = document.createElement("p");
    title.textContent = `${qIndex + 1}. ${q.question}`;
    block.appendChild(title);

    q.choices.forEach((choice, choiceIndex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = choice;
      btn.addEventListener("click", () => {
        selectedAnswers[qIndex] = choiceIndex;
        block
          .querySelectorAll(".choice-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        maybeShowSubmit();
      });
      block.appendChild(btn);
    });

    questionContainer.appendChild(block);
  });
}

function maybeShowSubmit() {
  const allAnswered = selectedAnswers.every((a) => a !== -1);
  submitBtn.classList.toggle("hidden", !allAnswered);
}

async function submitQuiz() {
  const res = await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: playerName, answers: selectedAnswers }),
  });
  const result = await res.json();

  scoreDisplay.textContent = `${result.score} / ${result.total}`;
  showScreen(resultScreen);
}

async function showLeaderboard() {
  const res = await fetch("/api/leaderboard");
  const entries = await res.json();

  leaderboardList.innerHTML = "";
  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.name} — ${entry.score}`;
    leaderboardList.appendChild(li);
  });

  showScreen(leaderboardScreen);
}

document.getElementById("start-btn").addEventListener("click", startQuiz);
document
  .getElementById("view-leaderboard-btn")
  .addEventListener("click", showLeaderboard);
document.getElementById("submit-btn").addEventListener("click", submitQuiz);
document
  .getElementById("show-leaderboard-btn")
  .addEventListener("click", showLeaderboard);
document.getElementById("back-btn").addEventListener("click", () => {
  showScreen(landingScreen);
});
document.getElementById("play-again-btn").addEventListener("click", () => {
  showScreen(landingScreen);
});
