import werkzeug
import importlib.metadata

# Need to do this so flask doesn't break
if not hasattr(werkzeug, '__version__'):
    werkzeug.__version__ = importlib.metadata.version("werkzeug")


import unittest
from unittest.mock import patch, MagicMock
from flask import session
import os
from datetime import datetime

# Testing environment
os.environ["PYTHON_TESTING"] = "1"
os.environ["MONGO_DB_NAME"] = "test"
os.environ["NYT_API_KEY"] = "TEST_KEY"

from app import app
from app import db
app.testing = True
client = app.test_client()


"""
BACKEND TESTER

1) API Key
Making sure your Flask server returns your API key as expected

2) NYT API
Making sure your NYT API returns data in the expected format (title, article_url, multimedia, abstract, etc)
Check that the query is correct (Davis or Sacramento news)

3) /api/me (auth)
4) /api/add_comment (with auth)
5) /api/comments
6) /api/remove/<id>

HOW TO RUN TEST:
cd backend
python app-test.py
"""

app.testing = True
client = app.test_client()

# EX TEST:
# print("Success")

# TESTS
class tester(unittest.TestCase):
    # 1) TEST API key .env values ===============================
    def test_APIKEY(self):
        os.environ["NYT_API_KEY"] = "TEST_KEY"
        res = client.get("/api/key")
        self.assertEqual(res.status_code, 200)
        self.assertIn("apiKey", res.get_json())
        self.assertEqual(res.get_json()["apiKey"], "TEST_KEY")

    # 2) TEST: NYT API ==========================================
    # Check proper format, correct query
    @patch("app.requests.get")
    def test_NYTQUERY(self, mock_get):
        # CREATE AN EXAMPLE RESPONSE to test query
        mock_get.return_value.json.return_value = {
            "response": {
                "docs": [
                    {
                        "headline": {"main": "Example title"},
                        "snippet": "Example snippet text",
                        "web_url": "https://www.test.com",
                        "pub_date": "2023-01-01T00:00:00Z",
                        "multimedia": {
                            "default": {"url": "https://www.testimage.com"},
                            "credit": "Credit text",
                            "caption": "Caption text"
                        },
                        "word_count": 380
                    }
                ]
            }
        }
        mock_get.return_value.status_code = 200

        # CREATE response for a test call
        res = client.get("/api/stories?key=TEST_API_KEY&page=0")

        # TEST: RESPONSE IS GOOD?
        self.assertEqual(res.status_code, 200)

        # TEST: CHECK RESPONSE IS LIST?
        data = res.get_json()
        self.assertTrue(type(data) == list)

        # TEST: CHECK THERE'S ARTICLE FIELDS in expected format
        article = data[0]
        self.assertTrue("title" in article)
        self.assertTrue("url" in article)
        self.assertTrue("snippet" in article)
        self.assertTrue("image" in article)
        self.assertTrue("credit" in article)
        self.assertTrue("caption" in article)
        self.assertTrue("published" in article)
        self.assertTrue("wc" in article)

        # TEST: DAVIS/SAC QUERY IS CORRECT?
        params = mock_get.call_args[1]["params"]
        self.assertTrue("Davis" in params["q"])
        self.assertTrue("Sacramento" in params["q"])

    # TEST: ERROR 500 API CALL ==================================
    @patch("app.requests.get", side_effect=Exception())
    def test_ERROR(self, mock_get):
        res = client.get("/api/stories?key=TEST_API_KEY&page=0")
        self.assertEqual(res.status_code, 500)
        self.assertEqual(res.get_json(), {"error": "API ERROR"})

    # 3) TEST: /api/me (auth)
    def test_3(self):
        with client.session_transaction() as sess:
            sess.clear()
        res = client.get("/api/me")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.get_json(), {"user": None})


    # 4) TEST: /api/add_comment (with auth)
    def test_4(self):
        res = client.get("/api/comments")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.get_json())

    # 5) TEST: /api/comments
    def test_5(self):
        with client.session_transaction() as sess:
            sess["user"] = {
                "sub": "asdad1312",
                "email": "asdad@hw3.com",
                "name": "1231231",
                "role": "user"
            }
        with patch.object(db.comments, "insert_one", return_value=MagicMock(inserted_id="mockid")):
            res = client.post("/api/add_comment", json={
                "id": "12331asd",
                "text": "TESTING",
                "parentId": None
            })
            self.assertEqual(res.status_code, 201)
            self.assertIn("comment_id", res.get_json())

    # 6) TEST comments from storyID /api/comments
    def test_6(self):
        with patch.object(db.comments, "find", return_value=[
            {
                "_id": "12312312313132",
                "storyId": "storyaaa",
                "text": "Story Text",
                "authorEmail": "hello@mail.com",
                "createdAt": datetime(2023, 1, 1, 0, 0, 0),
                "removedByModerator": False,
                "depth": 0
            }
        ]):
            res = client.get("/api/comments?storyId=storyaaa")
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(type(data) is list)
            self.assertEqual(data[0]["text"], "Story Text")

    # 7) TEST remove comments /api/remove/id
    def test_7(self):
        with client.session_transaction() as sess:
            sess["user"] = {"sub": "xyz", "email": "bruh@mail.com", "name": "bruh", "role": "user"}

        val = MagicMock(matched_count=1)
        with patch.object(db.comments, "update_one", return_value=val):
            with patch("app.ObjectId", return_value="mock_id"):
                res = client.delete("/api/remove/abc1231312313")
                self.assertEqual(res.status_code, 204)

    # 8) TEST bad comment ID /api/remove/id
    def test_8(self):
        with client.session_transaction() as sess:
            sess["user"] = {"sub": "xyz", "email": "bruh@mail.com", "name": "bruh", "role": "user"}
        res = client.delete("/api/remove/BADASDADASD")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.get_json())

    # 9) TEST clear comments /api/comments/clear
    def test_clear_comments(self):
        with patch.object(db.comments, "delete_many", return_value=None):
            res = client.get("/api/comments/clear")
            self.assertEqual(res.status_code, 204)

    # 10) TEST flask routes /_routes
    def test_10(self):
        res = client.get("/_routes")
        self.assertEqual(res.status_code, 200)
        self.assertIn("/api/stories", res.get_json())


if __name__ == "__main__":
    unittest.main()


"""
SOURCES
Unittest
https://docs.python.org/3/library/unittest.html

Mock tests for unittest
https://docs.python.org/3/library/unittest.mock.html

PATCH
The patch() decorator / context manager makes it easy to mock classes or objects 
in a module under test. The object you specify will be replaced with a mock 
(or other object) during the test and restored when the test ends:

from unittest.mock import patch
@patch('module.ClassName2')
@patch('module.ClassName1')
def test(MockClass1, MockClass2):
    module.ClassName1()
    module.ClassName2()
    assert MockClass1 is module.ClassName1
    assert MockClass2 is module.ClassName2
    assert MockClass1.called
    assert MockClass2.called

test()


MAGIC MOCK
https://docs.python.org/3/library/unittest.mock.html
"""