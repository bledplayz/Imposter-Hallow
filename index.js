
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");

const { attachAIChat } = require("./aiChat");

// Create the Discord client.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// Connect the AI chat system.
// Replies only in the channel configured in .env.
attachAIChat(client);

// Bot startup message.
client.once("ready", () => {
  console.log("================================");
  console.log(`Bot Name: ${client.user.tag}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log("AI Chat: Enabled");
  console.log("Memory: SQLite");
  console.log("================================");
});

// Catch unexpected errors.
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

// Start the bot.
if (!process.env.DISCORD_TOKEN) {
  console.error("ERROR: DISCORD_TOKEN is missing from .env");
  process.exit(1);
}

if (!process.env.GROQ_API_KEY) {
  console.error("ERROR: GROQ_API_KEY is missing from .env");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to log in to Discord:", error);
  process.exit(1);
});