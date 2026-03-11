# NEXGREX

Networked EXperience for the Gregarious Routing of Elderly eXchange (NEXGREX).

## What this is
- Single-room group chat
- Demo-only sign up + login (username, email, password)
- Realtime updates via Socket.IO
- MongoDB-backed users and messages

## Quick start

Install dependencies:

```
npm install
```

Set a MongoDB connection string (local or cloud):

PowerShell:

```
$env:MONGODB_URI="your-connection-string"
```

Or create a local `.env` file (see `.env.example`) at the project root.

Run in development (client + server):

```
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Production build

```
npm run build
npm run start
```

The server will serve the client build from client/dist.

## Notes
- Set `MONGODB_URI` in Render environment variables.
- Sessions expire after 12 hours.
- Image uploads use Cloudflare R2. Set these env vars in Render:
	- `R2_ENDPOINT`
	- `R2_ACCESS_KEY_ID`
	- `R2_SECRET_ACCESS_KEY`
	- `R2_BUCKET`
	- `R2_PUBLIC_URL`
- Max image size is 12 MB (supports 4k images without additional compression).