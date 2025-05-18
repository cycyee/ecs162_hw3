function updateDateTime() {
    const now = new Date();
    const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
};
    document.getElementById('dateTime').innerText = now.toLocaleString('en-US', options);
}

let me = null;

async function fetchMe() {
    try {
        const resp = await fetch("/api/me", {
            credentials: "include"
        });

        //401 specifically means we went thru n are not logged in
        if (resp.status === 401) {
            me = null;
            console.log("Not logged in (401)");
            return;
        }

        //actual fail in fetch
        if (!resp.ok) {
            console.error("fetchMe failed:", resp.status, resp.statusText);
            me = null;
            return;
        }

        const payload = await resp.json();
        me = payload.user ?? payload;
        console.log("Logged in as:", me);
    }
    catch (err) {
        console.error("fetchMe exception:", err);
        me = null;
    }
}

function renderAuthControls() {
    const container = document.getElementById("auth-controls");
    container.innerHTML = "";

    if (!me) {
        const btn = document.createElement("button");
        btn.textContent = "Log In";
        btn.onclick = () => {
            window.location.href = "http://localhost:8000/login";
        };
        container.appendChild(btn);
    }
    else {
        const btn = document.createElement("button");
        btn.textContent = "Log Out";
        btn.onclick = () => {
            window.location.href = "http://localhost:8000/logout";
        };
        container.appendChild(btn);
    }
}


function setupCommentUI(storyId, containerEl) {
    const listEl   = containerEl.querySelector(".comments-list");
    const inputEl  = containerEl.querySelector(".comment-input");
    const buttonEl = containerEl.querySelector(".comment-post-button");
    //not logged in -> no commenting for u
    if (!me) {
        inputEl.style.display  = "none";
        buttonEl.style.display = "none";
    } 
    else {
        inputEl.style.display  = "";
        buttonEl.style.display = "";
    }

    //fn to reload/ rerenter the comments for each story
    async function reloadComments() {
        const resp = await fetch(`/api/comments?storyId=${encodeURIComponent(storyId)}`,{ credentials: "include" });
        if (!resp.ok) return console.log("Failed to fetch comments");
        const comments = await resp.json();

        //map parent ids to children
        const byParent = {};
        comments.forEach(c => {
            byParent[c.id] = byParent[c.id] || [];
        });
        comments.forEach(c => {
            if (c.parentId && byParent[c.parentId]) {
            byParent[c.parentId].push(c);
            }
        });

        const renderTree = (nodes, container, depth = 0) => {
            nodes.forEach(c => {
            const div = document.createElement("div");
            div.style.marginLeft = `${depth * 20}px`;
            div.style.padding = "4px 0";
            div.style.borderLeft = depth ? "2px solid #ddd" : "";
            div.style.paddingLeft = depth ? "8px" : "";

            if (depth && c.parentEmail) {
                const info = document.createElement("div");
                info.style.fontSize = "0.8em";
                info.style.color = "#666";
                info.textContent = `Replying to ${c.parentEmail}`;
                div.appendChild(info);
            }

            if (c.removedByModerator) {
                div.appendChild(document.createTextNode("Comment removed by moderator"));
            }
            else {
                div.appendChild(document.createTextNode(`[${c.authorEmail}] ${c.text}`));

                // mod delete
                if (me && me.role === "moderator") {
                const btn = document.createElement("button");
                btn.textContent = "Delete";
                btn.style.marginLeft = "8px";
                btn.onclick = async () => {
                    await fetch(`/api/remove/${c.id}`, {
                    method: "DELETE", credentials: "include"
                    });
                    await reloadComments();
                };
                div.appendChild(btn);
                }

                if (me) {
                const reply = document.createElement("button");
                reply.textContent = "Reply";
                reply.style.marginLeft = "8px";
                reply.onclick = () => {
                    if (div.querySelector(".reply-input")) return;

                    const box = document.createElement("div");
                    box.style.marginTop = "4px";
                    box.innerHTML = `
                    <input type="text" class="reply-input" placeholder="Your reply…"/>
                    <button class="reply-submit">Send</button>
                    `;

                    box.querySelector(".reply-submit").onclick = async () => {
                        const text = box.querySelector(".reply-input").value.trim();
                        if (!text) return alert("Enter a reply");
                        await fetch("/api/add_comment", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                storyId,
                                parentId: c.id,    //pass comments id as parentid
                                text
                            })
                        });
                        await reloadComments();
                    };
                    div.appendChild(box);
                };
                div.appendChild(reply);
                }
            }

            container.appendChild(div);
            //recurse
            if (byParent[c.id] && byParent[c.id].length) {
                renderTree(byParent[c.id], container, depth + 1);
            }
            });
        };
        listEl.innerHTML = "";
        const roots = comments.filter(c => !c.parentId);
        renderTree(roots, listEl, 0);
    }
    //conection for add commen
    buttonEl.addEventListener("click", async () => {
        const text = inputEl.value.trim();
        if (!text) return alert("Enter a comment");
        const resp = await fetch("/api/add_comment", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storyId, text }),
        });
        if (!resp.ok) {
        console.error("Post failed", await resp.text());
        return;
        }
        inputEl.value = "";
        await reloadComments();
    });
    reloadComments();
    console.log("reloading comments", me)
}

let page = 1
let nextColumn = 0
let loading = false
let lastCall = 0

async function loadArticles() {
    if (loading) return; //if subsequent calls are too frequent or if we are in the middle of processing a call we return
    if (Date.now() - lastCall < 6000){
        return;
    }
    lastCall = Date.now()
    loading = true;
    try{ //try - catch for error checking in case the request fails
        const keyRes = await fetch('/api/key');
        const { apiKey } = await keyRes.json();
    
        const storiesRes = await fetch(`/api/stories?key=${encodeURIComponent(apiKey)}&page=${page}`);
        if (!storiesRes.ok) {
            console.error("API error", storiesRes.status, await storiesRes.text());
            observer.disconnect();// stop infinite‐scroll if server fails us
            loading = false;
            return;
        }
        page += 1 //increment page so the next fetch grabs new content
        const stories    = await storiesRes.json();
        
        const columns = Array.from(document.querySelectorAll('.column')) //grabs all of the 3 hardcoded columns
    
        stories.forEach((story, idx) => {
            const container = columns[nextColumn];
            nextColumn = (nextColumn + 1) % columns.length
    
            if (!container) {
                return;
            }
            //layout of appended html matches what I had in hw1, with minor improvements such as read time and photo credits

            const imgHtml = story.image
                ? `<img src="${story.image}" alt="${story.title}"/>`
                : `<div class="no-image">No image available</div>`;
        
            const date = story.published
                ? new Date(story.published).toLocaleDateString('en-US', {
                    weekday: 'short', year: 'numeric',
                    month: 'short', day: 'numeric'
                })
                : '';
            const readTime = story.wc ? `${Math.ceil(story.wc / 225)} MIN READ` : ""
            const newArticle = document.createElement('div')
            newArticle.innerHTML =
            `<article>
                ${imgHtml}
                <p class="credit">${story.credit}</p>
                <a href="${story.url}">${story.title}
                    <p class="date">${date}</p>
                    <p class="snippet">${story.snippet}</p>
                    <p class=readTime>${readTime}</p>
                </a>
            </article>

            <div class="comments-section" id="comments-${story.id}">
                <h4>Comments</h4>
                <div class="comments-list"></div>

                <input
                    type="text"
                    class="comment-input"
                    placeholder="Write a comment…"
                />
                <button class="comment-post-button">Post Comment</button>
            </div>`
            ;
            container.appendChild(newArticle)
            const commentSection = document.getElementById(`comments-${story.id}`);
            setupCommentUI(story.id, commentSection);
        });
        loading = false
    }
    catch (err) {
        console.error('Load failed:', err);
        observer.disconnect();
        console.log("error fetching request from nyt api")
    }
    
}

document.addEventListener("DOMContentLoaded", async () => {
    await fetchMe();
    renderAuthControls()
    console.log(" Current user:", me);
    updateDateTime();
    setInterval(updateDateTime, 1000);
    loadArticles();
});

const observer = new IntersectionObserver((entries, observer) => { //uses the intersectionObserver to make sure when we reach the bottom we make a new request
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            loadArticles()
            console.log("new articles loaded")
        }
    });
},
    {
        root: null,
        rootMargin: '0px 0px 25px 0px', //when we are within 25px of the watcher we load more content
        threshold: 0
    });

const watcher = document.getElementById('watcher') //I have a watcher element right below the columns
observer.observe(watcher)


// Export for Node Unit Testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateDateTime,
        loadArticles
    };
}
