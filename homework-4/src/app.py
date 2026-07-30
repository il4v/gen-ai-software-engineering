import json
import os

from flask import Flask, jsonify, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
QUESTIONS_PATH = os.path.join(BASE_DIR, "questions.json")
LEADERBOARD_PATH = os.path.join(BASE_DIR, "leaderboard.json")

app = Flask(__name__, static_folder="static", static_url_path="")


def load_questions():
    with open(QUESTIONS_PATH) as f:
        return json.load(f)


def load_leaderboard():
    if not os.path.exists(LEADERBOARD_PATH):
        return []
    with open(LEADERBOARD_PATH) as f:
        return json.load(f)


def save_leaderboard(entries):
    with open(LEADERBOARD_PATH, "w") as f:
        json.dump(entries, f, indent=2)


def compute_score(answers, questions):
    score = 0
    for i in range(len(answers)):
        if answers[i] == questions[i]["answer_index"]:
            score += 1
    return score


def sorted_leaderboard(entries):
    return sorted(entries, key=lambda e: e["score"], reverse=True)


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/api/questions")
def get_questions():
    questions = load_questions()
    public = [
        {"id": q["id"], "question": q["question"], "choices": q["choices"]}
        for q in questions
    ]
    return jsonify(public)


@app.route("/api/submit", methods=["POST"])
def submit():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip() or "Anonymous"
    answers = data.get("answers", [])
    questions = load_questions()

    score = compute_score(answers, questions)

    entries = load_leaderboard()
    entries.append({"name": name, "score": score})
    save_leaderboard(entries)

    return jsonify({"score": score, "total": len(questions)})


@app.route("/api/leaderboard")
def leaderboard():
    entries = load_leaderboard()
    top = sorted_leaderboard(entries)[:10]
    return jsonify(top)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
