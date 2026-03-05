// Load environment variables from .env file
require('dotenv').config();

module.exports = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID,
        guildId: process.env.DISCORD_GUILD_ID,
        status: process.env.DISCORD_STATUS,
        playing: process.env.DISCORD_PLAYING || ""
    },
    db: {
        host: process.env.DB_HOST,
        id: process.env.DB_ID,
        pw: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
    },
    api: {
        PAPAGO: [process.env.PAPAGO_CLIENT_ID, process.env.PAPAGO_CLIENT_SECRET],
        PAPAGO2: [process.env.PAPAGO2_CLIENT_ID, process.env.PAPAGO2_CLIENT_SECRET],
        coinmarketcap: process.env.COINMARKETCAP_API_KEY,
        openaiOrganization: process.env.OPENAI_ORGANIZATION,
        openaiApi: process.env.OPENAI_API_KEY
    },
    chat: {
        system: process.env.CHAT_SYSTEM,
        assistant: process.env.CHAT_ASSISTANT
    },
    channel_Tweet: process.env.CHANNEL_TWEET || "",
    channel_Tweet1: process.env.CHANNEL_TWEET1,
    voice_nickname: [
        {
            id: process.env.VOICE_NICKNAME_1_ID,
            on: process.env.VOICE_NICKNAME_1_ON,
            off: process.env.VOICE_NICKNAME_1_OFF
        },
        {
            id: process.env.VOICE_NICKNAME_2_ID,
            on: process.env.VOICE_NICKNAME_2_ON,
            off: process.env.VOICE_NICKNAME_2_OFF
        },
        {
            id: process.env.VOICE_NICKNAME_3_ID,
            on: process.env.VOICE_NICKNAME_3_ON,
            off: process.env.VOICE_NICKNAME_3_OFF
        }
    ],
    Twitter: process.env.TWITTER_API_KEY,
    TwitterS: process.env.TWITTER_API_SECRET,
    Twitter2: process.env.TWITTER2_ACCESS_TOKEN,
    Twitter2S: process.env.TWITTER2_ACCESS_SECRET
};
