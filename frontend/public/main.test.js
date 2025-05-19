/**
 * @jest-environment jsdom
 */

/*
** RUN TEST (Do the commands in order): 
> cd frontend
> npm test
*/

// Need to create mocks before import
global.IntersectionObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
};

global.fetch = jest.fn();

// Set up the elements
beforeEach(() => {
    document.body.innerHTML = `
        <div id="dateTime"></div>
        <div class="column"></div>
        <div class="column"></div>
        <div class="column"></div>
        <div id="watcher"></div>
        <div id="auth-controls"></div>
        <div id="sidebar-close"></div>
        <div id="comment-sidebar"></div>
        <div id="overlay"></div>
        <div id="sidebar-comments-list"></div>
        <input id="sidebar-comment-input" />
        <button id="sidebar-post-btn"></button>
    `;
    fetch.mockReset();
});

// AFTER MOCKING, Import
const { updateDateTime, loadArticles, setupPage } = require('./main.js');

// 1. Basic Sanity Check
test('basic sanity check', () => {
    expect(1 + 1).toBe(2);
});

// 2. Check updateDateTime output
test('TEST: updateDateTime is correct date', () => {
    updateDateTime();
    const dateText = document.getElementById('dateTime').innerText;
    const expected = new Date().toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    expect(dateText).toBe(expected);
});

// 3. Test article rendering
test('TEST: loadArticles has correct article load', async () => {
    fetch
        .mockResolvedValueOnce({
            json: () => Promise.resolve({ apiKey: "TEST_API_KEY" })
        })
        .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([{
                id: "test-id",
                title: "Test Title",
                snippet: "Test Snippet",
                url: "https://test.com",
                published: "2023-01-01T00:00:00Z",
                image: "https://test.com/image.png",
                credit: "Test Author",
                wc: 450
            }])
        });

    await loadArticles();

    const article = document.querySelector('article');
    expect(article).not.toBeNull();
    expect(article.innerHTML).toMatch(/Test Title/);
    expect(article.innerHTML).toMatch(/Test Snippet/);
    expect(article.innerHTML).toMatch(/Test Author/);
    expect(article.innerHTML).toMatch(/2 MIN READ/);
    expect(article.querySelector('a').href).toBe("https://test.com/");
    expect(article.querySelector('img').src).toBe("https://test.com/image.png");
});

// 4. TEST Sidebar
test('TEST: setupPage binds sidebar close button', async () => {
    // mock /api/me fetch
    fetch.mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: () => Promise.resolve({})
    });

    setupPage();
    document.dispatchEvent(new Event("DOMContentLoaded"));

    const sidebar = document.getElementById('comment-sidebar');
    const overlay = document.getElementById('overlay');
    const closeBtn = document.getElementById('sidebar-close');

    sidebar.classList.add('open');
    overlay.style.display = 'block';

    await new Promise(res => setTimeout(res, 10));

    closeBtn.click();

    expect(sidebar.classList.contains('open')).toBe(false);
    expect(overlay.style.display).toBe('none');
});

// 5. TEST LOGIN
test('TEST: renderAuthControls shows "Log In" if not logged in', () => {
    const { renderAuthControls } = require('./main.js');
    global.me = null;
    renderAuthControls();
    expect(document.querySelector('#auth-controls button').textContent).toBe('Log In');
});


/*
SOURCES: 
For Mock
https://stackoverflow.com/questions/58884397/jest-mock-intersectionobserver

Testing the date
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString
*/


