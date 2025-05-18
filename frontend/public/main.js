document.addEventListener("DOMContentLoaded", async () => {
    await fetchMe();
    renderAuthControls();
    updateDateTime();
    setInterval(updateDateTime, 1000);
    loadArticles();

    document.getElementById("sidebar-close").onclick = () => {
        document.getElementById("comment-sidebar").classList.remove("open");
    };
});

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

function setupSidebarCommentUI(storyId) {
    const sidebar = document.getElementById("comment-sidebar");
    const listEl = document.getElementById("sidebar-comments-list");
    const inputEl = document.getElementById("sidebar-comment-input");
    const buttonEl = document.getElementById("sidebar-post-btn");

    sidebar.classList.add("open");
    sidebar.dataset.storyId = storyId;

    //not logged in -> no commenting for u
    if (!me) {
        inputEl.style.display = "none";
        buttonEl.style.display = "none";
    } 
    else {
        inputEl.style.display = "";
        buttonEl.style.display = "";
    }

    //fn to reload/ rerenter the comments for each story
    async function reloadComments() {
        const resp = await fetch(`/api/comments?storyId=${encodeURIComponent(storyId)}`, { credentials: "include" });
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



let page = 1;
let nextColumn = 0;
let loading = false;
let lastCall = 0;

async function loadArticles() {
    if (loading || Date.now() - lastCall < 6000) return;
    lastCall = Date.now();
    loading = true;
    try {
        const { apiKey } = await (await fetch('/api/key')).json();
        const storiesRes = await fetch(`/api/stories?key=${encodeURIComponent(apiKey)}&page=${page}`);
        if (!storiesRes.ok) return;
        page++;
        const stories = await storiesRes.json();
        const columns = Array.from(document.querySelectorAll('.column'));

        stories.forEach(story => {
            const container = columns[nextColumn];
            nextColumn = (nextColumn + 1) % columns.length;
            if (!container) return;

            const imgHtml = story.image
                ? `<img src="${story.image}" alt="${story.title}"/>`
                : `<div class="no-image">No image available</div>`;

            const date = story.published ? new Date(story.published).toLocaleDateString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
            }) : '';
            const readTime = story.wc ? `${Math.ceil(story.wc / 225)} MIN READ` : "";

            const newArticle = document.createElement('div');
            newArticle.innerHTML = `
                <article>
                    ${imgHtml}
                    <p class="credit">${story.credit}</p>
                    <a href="${story.url}">${story.title}
                        <p class="date">${date}</p>
                        <p class="snippet">${story.snippet}</p>
                        <p class="readTime">${readTime}</p>
                    </a>
                    <button class="view-comments-button" data-id="${story.id}">View Comments</button>
                </article>`;

            newArticle.querySelector(".view-comments-button").onclick = (e) => {
                const id = e.target.dataset.id;
                setupSidebarCommentUI(id);
            };

            container.appendChild(newArticle);
        });
    } catch (err) {
        console.error('Load failed:', err);
    } finally {
        loading = false;
    }
}

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) loadArticles();
    });
}, {
    root: null,
    rootMargin: '0px 0px 25px 0px',
    threshold: 0
});

observer.observe(document.getElementById('watcher'));



// Export for Node Unit Testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateDateTime,
        loadArticles
    };
}
