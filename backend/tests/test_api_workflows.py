"""
Offline API workflow tests for FastAPI routers (requires pytest + fastapi + httpx).
AI provider and MongoDB repositories are monkeypatched cleanly.
"""
from backend.tests.conftest import auth


def test_rubric_create_and_version_history(client, token_a, monkeypatch):
    versions = [
        {"_id": "v1", "rubric_id": "r1", "version": 1, "name": "Physics Rubric", "questions": []},
        {"_id": "v2", "rubric_id": "r1", "version": 2, "name": "Physics Rubric", "questions": []},
    ]
    monkeypatch.setattr(
        "backend.routers.rubrics.create_rubric_with_version",
        lambda data, uid, email: {"_id": "r1", "owner_id": uid, "creator": email, "current_version": 1, **data},
    )
    monkeypatch.setattr("backend.routers.rubrics.log_audit_event", lambda **kwargs: None)
    monkeypatch.setattr("backend.routers.rubrics.get_rubric_by_id", lambda rid: {"_id": rid, "owner_id": "user-A", "creator": "a@test.com", "name": "Physics Rubric", "current_version": 2})
    monkeypatch.setattr("backend.routers.rubrics.list_rubric_versions", lambda rid: versions)

    res = client.post(
        "/rubrics/create",
        headers=auth(token_a),
        json={
            "name": "Physics Rubric",
            "subject": "Physics",
            "questions": [
                {
                    "text": "Explain Newton's 2nd Law",
                    "criteria": [{"title": "Formula", "description": "States F=ma", "points": 5}],
                }
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["rubric"]["current_version"] == 1

    hist = client.get("/rubrics/r1/versions", headers=auth(token_a))
    assert hist.status_code == 200
    assert len(hist.json()["versions"]) == 2


def test_bulk_regrade_requires_explicit_confirmation(client, token_a, monkeypatch):
    class FakeCol:
        def find(self, query):
            return [
                {"_id": "res1", "owner_id": "user-A", "question": "Q1", "max_marks": 5, "student_answer": "A1", "grading": {"final_marks": 3}},
                {"_id": "res2", "owner_id": "user-A", "question": "Q1", "max_marks": 5, "student_answer": "A2", "grading": {"final_marks": 4}},
            ]

    monkeypatch.setattr("backend.routers.grading.get_rubric_by_id", lambda rid: {"_id": rid, "owner_id": "user-A", "creator": "a@test.com"})
    monkeypatch.setattr("backend.routers.grading.get_rubric_version", lambda rid, v=None: {"version": 2, "name": "R", "questions": []})
    monkeypatch.setattr("backend.routers.grading.results_col", FakeCol())

    r = client.post(
        "/grading/regrade",
        headers=auth(token_a),
        json={"rubric_id": "r1", "confirm_bulk": False},
    )
    assert r.status_code == 400
    assert "confirm_bulk" in r.json()["detail"]
