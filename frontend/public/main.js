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

let me;

//load up and grab login info (mod vs user)
async function fetchMe() {
    const resp = await fetch("/api/me", { credentials: "include" });
    if (resp.ok) {
        me = await resp.json();
    } 
    else {
        me = null;
    }
}

function setupCommentUI(storyId, containerEl) {
    const listEl   = containerEl.querySelector(".comments-list");
    const inputEl  = containerEl.querySelector(".comment-input");
    const buttonEl = containerEl.querySelector(".comment-post-button");

    //fn to reload/ rerenter the comments for each story
    async function reloadComments() {
        const resp = await fetch(
        `/api/comments?storyId=${encodeURIComponent(storyId)}`,
        { credentials: "include" }
        );
        if (!resp.ok) {
        console.error("Failed to fetch comments for", storyId);
        return;
        }
        const comments = await resp.json();
        listEl.innerHTML = "";
        comments.forEach(c => {
            const div = document.createElement("div");
            div.style.padding = "4px 0"; //need to add styling latr
            if (c.removedByModerator) {
                div.textContent = "Comment removed by moderator";
            } 
            else {
                div.textContent = `[${c.authorEmail}] ${c.text}`;
                if (me && me.role === "moderator") {
                const btn = document.createElement("button");
                btn.textContent = "Delete";
                btn.style.marginLeft = "8px"; //tsyle needed

                btn.onclick = async () => {
                    await fetch(`/api/remove/${encodeURIComponent(c.id)}`, {
                    method: "DELETE",
                    credentials: "include",
                    });
                    await reloadComments();
            };
            div.appendChild(btn);
            }
        }
        listEl.appendChild(div);
        });
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
}

//globals for pagination, distributing items among columns, and rate throttling (all below imported fom hw2)
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
                    style="width:80%; padding:4px;"
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
