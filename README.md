# NYT API Website HW3 
- Calvin Yee
- Mehroz Akhtar

> [!NOTE]
> Make sure to put API key in the .env file!
*Example .env file:*
```
NYT_API_KEY="APIKEY"
PORT=8000
```

## Running the NYT Website
Run these commands in order:

1) Run: `docker-compose -f docker-compose.dev.yml up --build`
2) Put this URL in your browser to view the website: `http://localhost:5173/`
3) Press CTRL+C to quit the server

## Running Tests

NOTE: The tests will run in the terminal.
### Test front end:
Run these commands in order:
1) `cd frontend`
2) `npm install`
3) `npm test`

### Test back end:
Run these commands in order:
1) `cd backend`
2) `python app-test.py`