import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';

const app = express();
app.use(cors());

// 🔴 PASTE YOUR REAL VALUES HERE
const API_KEY = 'APIMM5Kapzo92fo';
const API_SECRET = 'ZYId4S5gbwQSBA2KyOrYolJGXiVvOpsWwcE3YgvV28I';

app.get('/token', async (req, res) => {
  const { room, username, role } = req.query;

  const at = new AccessToken(API_KEY, API_SECRET, { identity: username });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: role === 'broadcaster',
    canSubscribe: true,
  });

  const token = await at.toJwt();
  res.send(token);
});

app.listen(3001, () => console.log('Token server running on http://localhost:3001'));

//ZYId4S5gbwQSBA2KyOrYolJGXiVvOpsWwcE3YgvV28I