# NurSara API Proxy

Serverless proxy for the Anthropic API. Keeps the API key server-side.
Deploys to Vercel free tier in under 5 minutes.

## Deploy in 5 steps

### 1. Install Vercel CLI
```
npm install -g vercel
```

### 2. Clone / download this folder
Put the three files somewhere on your computer:
- api/transform.js
- vercel.json  
- package.json

### 3. Deploy
```
cd nursara-proxy
vercel
```
Follow the prompts. Choose: new project, no framework, deploy.

### 4. Add your Anthropic API key
In the Vercel dashboard:
Settings → Environment Variables → Add:
  Name:  ANTHROPIC_API_KEY
  Value: sk-ant-...your key...

Then redeploy:
```
vercel --prod
```

### 5. Get your URL
Vercel gives you a URL like:
https://nursara-proxy.vercel.app

That's your /api/transform endpoint:
https://nursara-proxy.vercel.app/api/transform

## Use in Base44

In your Base44 frontend, call:
```
POST https://nursara-proxy.vercel.app/api/transform
Content-Type: application/json

{
  "text": "patient was in pain, lower back, gave paracetamol",
  "lang": "English",
  "scenario": "pain"
}
```

Response:
```json
{
  "clinical_german": "Beobachtung: ...\n\nMaßnahme: ...\n\nEmpfehlung: ...",
  "confidence": "high",
  "ambiguity_flags": [],
  "vocabulary": [...],
  "advisorUsed": false,
  "model": "haiku"
}
```

## Free tier limits
Vercel free: 100,000 function invocations/month
That's 3,333 transforms/day — more than enough for 200 pilot users.

## When Base44 Builder plan is active
Move the contents of api/transform.js into Base44's
backend function editor. Delete this Vercel deployment.
Everything works the same — just hosted in one place.
