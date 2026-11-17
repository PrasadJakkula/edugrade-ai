import os
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.server_api import ServerApi

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/evaluai")

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        _client = MongoClient(MONGODB_URI, server_api=ServerApi("1"))
        _db = _client.get_database()
    return _db


class _LazyDB:
    def __getitem__(self, name: str):
        return get_db()[name]

    def __getattr__(self, name: str):
        return getattr(get_db(), name)


db = _LazyDB()


def ensure_indexes() -> None:
    database = get_db()
    database["users"].create_index([("email", ASCENDING)], unique=True)
    database["rubrics"].create_index([("owner_id", ASCENDING), ("updated_at", DESCENDING)])
    database["rubric_versions"].create_index([("rubric_id", ASCENDING), ("version", DESCENDING)], unique=True)
    database["exams"].create_index([("owner_id", ASCENDING), ("created_at", DESCENDING)])
    database["grading_results"].create_index([("owner_id", ASCENDING), ("exam_id", ASCENDING), ("created_at", DESCENDING)])
    database["grading_history"].create_index([("result_id", ASCENDING), ("created_at", DESCENDING)])
    database["batch_jobs"].create_index([("owner_id", ASCENDING), ("created_at", DESCENDING)])
    database["datasets"].create_index([("owner_id", ASCENDING), ("created_at", DESCENDING)])
    database["evaluation_runs"].create_index([("owner_id", ASCENDING), ("created_at", DESCENDING)])
    database["audit_logs"].create_index([("owner_id", ASCENDING), ("timestamp", DESCENDING)])
