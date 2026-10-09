
require("dotenv").config();

const Groq = require("groq-sdk");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const db = new sqlite3.Database(
  path.join(__dirname, "ai-memory.sqlite")
);

const CHANNEL_ID = process.env.AI_CHAT_CHANNEL_ID;
const MODEL =
  process.env.AI_MODEL || "openai/gpt-oss-20b";

const MAX_HISTORY = 12;
const MAX_PROMPT_LENGTH = 3000;
const busyUsers = new Set();

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

async function getHistory(channelId, userId) {
  const rows = await all(
    `SELECT role, content
     FROM ai_messages
     WHERE channel_id = ? AND user_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    [channelId, userId, MAX_HISTORY]
  );

  return rows.reverse();
}

async function saveMessage(channelId, userId, role, content) {
  await run(
    `INSERT INTO ai_messages
      (channel_id, user_id, role, content)
     VALUES (?, ?, ?, ?)`,
    [channelId, userId, role, content]
  );
}

async function sendLongReply(message, text) {
  const chunks = text.match(/[\s\S]{1,1900}/g) || [
    "I couldn't generate a reply."
  ];

  await message.reply({
    content: chunks[0],
    allowedMentions: { repliedUser: false }
  });

  for (const chunk of chunks.slice(1)) {
    await message.channel.send({
      content: chunk,
      allowedMentions: { parse: [] }
    });
  }
}

function attachAIChat(client) {
  if (!CHANNEL_ID) {
    console.error(
      "AI chat disabled: AI_CHAT_CHANNEL_ID is missing from .env"
    );
    return;
  }

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.channelId !== CHANNEL_ID) return;
    if (!message.guild) return;

    const prompt = message.content.trim();

    if (!prompt) return;

    if (prompt.length > MAX_PROMPT_LENGTH) {
      await message.reply(
        "Please keep your message under 3,000 characters."
      );
      return;
    }

    const requestKey =
      `${message.channelId}:${message.author.id}`;

    if (busyUsers.has(requestKey)) {
      await message.reply(
        "I'm still answering your previous message. Please wait!"
      );
      return;
    }

    busyUsers.add(requestKey);

    try {
      await message.channel.sendTyping();

      const history = await getHistory(
        message.channelId,
        message.author.id
      );

      const completion = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a friendly AI assistant in a Discord server. " +
              "Be helpful, natural, respectful, and concise. " +
              "Use the conversation history to understand follow-up questions."
          },
          ...history,
          { role: "user", content: prompt }
        ],
        max_completion_tokens: 700,
        temperature: 0.7
      });

      const answer =
        completion.choices[0]?.message?.content?.trim();

      if (!answer) {
        await message.reply(
          "I couldn't generate a reply. Please try again."
        );
        return;
      }

      await saveMessage(
        message.channelId,
        message.author.id,
        "user",
        prompt
      );

      await saveMessage(
        message.channelId,
        message.author.id,
        "assistant",
        answer
      );

      await sendLongReply(message, answer);
    } catch (error) {
      console.error("AI chat error:", error);

      await message.reply(
        "The AI is temporarily unavailable. Please try again later."
      ).catch(() => {});
    } finally {
      busyUsers.delete(requestKey);
    }
  });

  console.log(`AI chat enabled for channel ${CHANNEL_ID}`);
}

module.exports = { attachAIChat };