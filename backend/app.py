from flask import Flask, jsonify, send_from_directory, request, url_for, redirect, session
import os
from flask_cors import CORS
from pymongo import MongoClient
import requests
from authlib.integrations.flask_client import OAuth
import traceback
from functools import wraps
from bson import ObjectId
from datetime import datetime



static_path = os.getenv('STATIC_PATH','static')
template_path = os.getenv('TEMPLATE_PATH','templates')
#mongo
mongo_uri = os.getenv("MONGO_URI")
mongo = MongoClient(mongo_uri)
db = mongo.get_default_database()


app = Flask(__name__, static_folder=static_path, template_folder=template_path)
CORS(app)

#wrappers to guard my routes
def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return jsonify({"error": "Not authenticated"}), 401
        return f(*args, **kwargs)
    return decorated


def requires_moderator(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = session.get("user", {})
        if user.get("role") != "moderator":
            return jsonify({"error": "Forbidden"}), 403
        return f(*args, **kwargs)
    return decorated


app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key")


app.config.update({
    "OIDC_CLIENT_ID":         os.getenv("OIDC_CLIENT_ID"),
    "OIDC_CLIENT_SECRET":     os.getenv("OIDC_CLIENT_SECRET"),
    "OIDC_DISCOVERY_URL":     os.getenv("OIDC_DISCOVERY_URL"),
    "OIDC_SCOPE":             "openid profile email",
})

oauth = OAuth(app)
oauth.register(
    name="dex",
    client_id=app.config["OIDC_CLIENT_ID"],
    client_secret=app.config["OIDC_CLIENT_SECRET"],
    server_metadata_url=app.config["OIDC_DISCOVERY_URL"],
    authorize_url="http://localhost:5556/auth",
    access_token_url="http://dex:5556/token",
    client_kwargs={"scope": app.config["OIDC_SCOPE"]},
)


@app.route("/login")
def login():
    #redirect to dex auth
    redirect_uri = url_for("auth_callback", _external=True)
    return oauth.dex.authorize_redirect(redirect_uri)


@app.route("/auth/callback")
def auth_callback():
    print("[auth_callback] request.args:", request.args)

    #protection for error/missing args
    if "error" in request.args:
        print("[auth_callback] Dex returned error:", request.args["error"])
        return redirect(url_for("login"))
    if "code" not in request.args:
        print("[auth_callback] No code in args, bouncing to login")
        return redirect(url_for("login"))

    #xchange code
    try:
        token = oauth.dex.authorize_access_token()
        print("[auth_callback] token response:", token)

        user_info = oauth.dex.parse_id_token(token, nonce=None)
        print("[auth_callback] parsed user_info:", user_info)
        if user_info.get("email") == "moderator@hw3.com":
            role = "moderator"

        elif user_info.get("email") == "admin@hw3.com":
            role = "admin"
        
        else:
            role = "user"

        session["user"] = {
            "sub":   user_info["sub"],
            "email": user_info.get("email"),
            "name":  user_info.get("name"),
            "role":  role
        }
        print(session["user"])
    except Exception as e:
        print("[auth_callback] Exception during token exchange/parsing:")
        traceback.print_exc()
        return "Authentication failed", 500
    #redirect (temp debug fr now)
    return redirect("/api/me")


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/")

#route to grab all the comments on some story
@app.route("/api/comments", methods=["GET"])
@requires_auth
def list_comments():
    story_id = request.args.get("storyId")
    if not story_id:
        return jsonify({"error": "Missing storyId"}), 400

    cursor = db.comments.find({"storyId": story_id})
    comments = []
    for c in cursor:
        comments.append({
            "id": str(c["_id"]),
            "parentId": str(c["parentId"]) if c.get("parentId") else None,
            "authorEmail": c.get("authorEmail"),
            "text": c.get("text"),
            "createdAt":c.get("createdAt").isoformat() if c.get("createdAt") else None,
            "removedByModerator":c.get("removedByModerator", False)
        })

    return jsonify(comments)

#actually add a comment
@app.route("/api/add_comment", methods=["POST"])
@requires_auth
def add_comment():
    data = request.get_json() or {}
    story_id = data.get("id") or data.get("storyId")
    text = data.get("text")

    if not text:
        return jsonify({"error": "Missing storyId or text"}), 400

    comment = {
        "storyId":            story_id,
        "text":               text,
        "authorId":           session["user"]["sub"],
        "authorEmail":        session["user"]["email"],
        "createdAt":          datetime.now(),
        "removedByModerator": False
    }
    result = db.comments.insert_one(comment)
    return jsonify({"comment_id": str(result.inserted_id)}), 201

#delete some comment id
@app.route("/api/remove/<id>", methods=["DELETE"])
#@requires_moderator
@requires_auth
def remove_comment(id):
    try:
        obj_id = ObjectId(id)
    except Exception:
        return jsonify({"error": "Invalid comment id"}), 400

    result = db.comments.update_one(
        {"_id": obj_id},
        {"$set": {"removedByModerator": True}}
    )
    if result.matched_count == 0:
        return jsonify({"error": "Comment not found"}), 404
    return ("", 204)

#debug to grab login infp
@app.route("/api/me")
def me():
    if "user" not in session:
        return jsonify({"error": "Not logged in bud"}), 401
    
    user = session["user"]
    return jsonify({
        "sub":   user["sub"],
        "email": user["email"],
        "name":  user["name"],
        "role":  user["role"],
    })

@app.route('/api/key')
def get_key():
    return jsonify({'apiKey': os.getenv('NYT_API_KEY')})


#imported from hw2
@app.route("/api/stories")
def get_stories():
    api_key = request.args.get('key')
    page = request.args.get('page')
    NYT_SEARCH_URL = "https://api.nytimes.com/svc/search/v2/articlesearch.json"

    params = {
        "api-key": api_key,
        "q": "Davis OR Sacramento OR Yolo County",
        "timesTag.location": "Sacramento, California OR Davis, California",
        "page" : page
        #"sort" : "relevance"
    }
    # TRY API, ERROR CHECKING
    try:
        resp = requests.get(NYT_SEARCH_URL, params=params, timeout=5)
        resp.raise_for_status()
        docs = (resp.json().get("response") or {}).get("docs") or []
        stories = []
        for doc in docs:
            stories.append({
                "title":     doc.get("headline", {}).get("main", ""),
                "snippet":   doc.get("snippet", ""),
                "url":       doc.get("web_url", ""),
                "published": doc.get("pub_date", ""),
                "image": doc.get("multimedia", {}).get("default", {}).get("url", ""), 
                "credit": doc.get("multimedia", {}).get("credit", ""), 
                "caption" : doc.get("multimedia", {}).get("caption", ""),
                "wc" : doc.get("word_count", ""),
                "id" : doc.get("_id", "")
            })

        return jsonify(stories)

    except:
        return jsonify({"error": "API ERROR"}), 500


@app.route("/_routes")
def list_routes():
    return jsonify(sorted(str(r) for r in app.url_map.iter_rules()))

@app.route('/')
@app.route('/<path:path>')
def serve_frontend(path=''):
    if path != '' and os.path.exists(os.path.join(static_path,path)):
        return send_from_directory(static_path, path)
    return send_from_directory(template_path, 'index.html')

@app.route("/test-mongo")
def test_mongo():
    cursor = db.comments.find()
    comments = []
    for c in cursor:
        comments.append({
            "id":       str(c["_id"]),
            "storyId":  c.get("storyId"),
            "text":     c.get("text"),
            "authorEmail": c.get("authorEmail"),
            "createdAt":   c.get("createdAt").isoformat() if c.get("createdAt") else None,
            "removed":     c.get("removedByModerator", False)
        })
    return jsonify({"collections": db.list_collection_names(), "comments" : comments})

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8000)),debug=debug_mode)