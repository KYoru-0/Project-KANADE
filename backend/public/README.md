# Backend Static Media

Put files here that need to be served directly over HTTP to the frontend or clients.

## Suggested Structure:
- `audio/`: MP3 files
- `covers/`: Album art / cover images

## Serving in Express:
```javascript
const path = require('path');
app.use('/static', express.static(path.join(__dirname, 'public')));
```
Files will then be reachable at:
`http://localhost:5000/static/audio/<filename>`
