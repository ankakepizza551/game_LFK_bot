require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('募集')
        .setDescription('ゲームの参加者を募集します')
        .addStringOption(o => o.setName('ゲーム名').setDescription('募集するゲーム名').setRequired(true))
        .addIntegerOption(o => o.setName('人数').setDescription('定員（デフォルト: 4人）').setMinValue(2).setMaxValue(20))
        .addStringOption(o => o.setName('開始時間').setDescription('開始時間（例: 21:00）'))
        .addStringOption(o => o.setName('メンション').setDescription('メンション先').addChoices(
            { name: '@here', value: '@here' },
            { name: '@everyone', value: '@everyone' },
            { name: 'なし', value: 'none' },
        )),
    new SlashCommandBuilder()
        .setName('アンケート')
        .setDescription('アンケートを作成します（2〜4択）')
        .addStringOption(o => o.setName('質問').setDescription('質問文').setRequired(true))
        .addStringOption(o => o.setName('選択肢1').setDescription('選択肢1').setRequired(true))
        .addStringOption(o => o.setName('選択肢2').setDescription('選択肢2').setRequired(true))
        .addStringOption(o => o.setName('選択肢3').setDescription('選択肢3'))
        .addStringOption(o => o.setName('選択肢4').setDescription('選択肢4')),
    new SlashCommandBuilder()
        .setName('ダイス')
        .setDescription('ダイスを振ります')
        .addStringOption(o => o.setName('notation').setDescription('例: 2d6（デフォルト: 1d6、最大10個・d100まで）')),
].map(c => c.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!clientId) {
        console.error('[ERROR] CLIENT_ID is not set in .env');
        process.exit(1);
    }

    if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log('[OK] Guild commands registered! (instant)');
    } else {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('[OK] Global commands registered! (up to 1 hour to reflect)');
    }
})().catch(console.error);
