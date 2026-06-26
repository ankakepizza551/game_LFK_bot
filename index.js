require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const TOKEN = process.env.DISCORD_TOKEN;

let participants = [];
let currentMaxPlayers = 4;
let currentGameName = 'ゲーム';
let startTime = '未定';
let isClosed = false;

// アンケート管理
let pollCounter = 0;
const polls = new Map(); // pollId -> { question, options: [{label, voters: Set}], closed }

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const args = message.content.trim().split(/[\s 　]+/);
    const command = args[0];

    // ダイスロール
    if (command === '!ダイス' || command === '!dice') {
        const notation = args[1] || '1d6';
        const result = rollDice(notation);
        if (!result) {
            return message.reply('形式が正しくありません。例: `!ダイス 2d6`（最大10個、最大d100）');
        }
        const rollText = result.rolls.length > 1 ? `[${result.rolls.join(', ')}] → **合計: ${result.total}**` : `**${result.total}**`;
        const embed = new EmbedBuilder()
            .setTitle(`🎲 ${result.count}d${result.sides} を振った！`)
            .setDescription(rollText)
            .setColor(0x5865f2);
        return message.reply({ embeds: [embed] });
    }

    // アンケート
    if (command === '!アンケート' || command === '!poll') {
        if (args.length < 4) {
            return message.reply('使い方: `!アンケート 質問文 選択肢1 選択肢2 [選択肢3] [選択肢4]`');
        }
        const question = args[1];
        const options = args.slice(2, 6); // 最大4択
        if (options.length < 2) {
            return message.reply('選択肢を2つ以上指定してください。');
        }

        const pollId = ++pollCounter;
        const pollData = {
            question,
            options: options.map(label => ({ label, voters: new Set() })),
            closed: false,
        };
        polls.set(pollId, pollData);

        const embed = createPollEmbed(pollId, pollData);
        const rows = createPollButtons(pollId, pollData);
        await message.channel.send({ embeds: [embed], components: rows });
        return;
    }

    if (command === '!募集') {
        participants = [];
        isClosed = false;
        startTime = '未定';
        let mentionText = '@here'; 

        currentGameName = args[1] || 'ゲーム';
        
        if (args[2]) {
            const match = args[2].match(/\d+/);
            currentMaxPlayers = match ? parseInt(match[0], 10) : 4;
        } else {
            currentMaxPlayers = 4;
        }

        for (let i = 3; i < args.length; i++) {
            const arg = args[i];
            
            if (arg === 'なし' || arg === 'nomention') {
                mentionText = '';
            }
            else if (arg === '@everyone') {
                mentionText = '@everyone';
            }
            else {
                startTime = arg;
            }
        }

        const embed = createEmbed();
        const row = createButtons();

        if (mentionText !== '') {
            await message.channel.send({ content: mentionText, embeds: [embed], components: [row] });
        } else {
            await message.channel.send({ embeds: [embed], components: [row] });
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    // アンケートのボタン処理
    if (customId.startsWith('poll_')) {
        const parts = customId.split('_');
        const pollId = parseInt(parts[2]);
        const pollData = polls.get(pollId);
        if (!pollData) return interaction.reply({ content: 'このアンケートはすでに削除されました。', flags: MessageFlags.Ephemeral });

        if (parts[1] === 'close') {
            pollData.closed = true;
            await interaction.update({ embeds: [createPollEmbed(pollId, pollData)], components: createPollButtons(pollId, pollData) });
            return;
        }

        if (pollData.closed) {
            return interaction.reply({ content: 'このアンケートはすでに終了しています。', flags: MessageFlags.Ephemeral });
        }

        const optionIndex = parseInt(parts[3]);
        const userId = interaction.user.id;

        // すでに同じ選択肢に投票済みなら取り消し、別の選択肢なら切替
        const alreadyVotedOption = pollData.options.findIndex(o => o.voters.has(userId));
        if (alreadyVotedOption === optionIndex) {
            pollData.options[optionIndex].voters.delete(userId);
        } else {
            if (alreadyVotedOption !== -1) pollData.options[alreadyVotedOption].voters.delete(userId);
            pollData.options[optionIndex].voters.add(userId);
        }

        await interaction.update({ embeds: [createPollEmbed(pollId, pollData)], components: createPollButtons(pollId, pollData) });
        return;
    }

    // 募集ボタンの処理
    if (isClosed) {
        return interaction.reply({ content: 'この募集はすでに終了しています。', flags: MessageFlags.Ephemeral });
    }

    const username = interaction.user.username;

    if (customId === 'join_game') {
        if (participants.includes(username)) {
            return interaction.reply({ content: 'すでに入っています！', flags: MessageFlags.Ephemeral });
        }
        if (participants.length >= currentMaxPlayers) {
            return interaction.reply({ content: 'もう満員です！', flags: MessageFlags.Ephemeral });
        }
        participants.push(username);
    }

    if (customId === 'cancel_game') {
        if (!participants.includes(username)) {
            return interaction.reply({ content: 'まだ参加していません。', flags: MessageFlags.Ephemeral });
        }
        participants = participants.filter(user => user !== username);
    }

    if (customId === 'close_game') {
        isClosed = true;
    }

    await interaction.update({ content: '', embeds: [createEmbed()], components: [createButtons()] });
});

function createEmbed() {
    const remaining = currentMaxPlayers - participants.length;
    const participantList = participants.length > 0 ? participants.join('\n') : '（まだいません）';

    let title = `🎮 ${currentGameName} 募集開始！`;
    let color = 0x00ff00;
    let footerText = 'ボタンを押して参加してね';

    if (isClosed) {
        title = `🔒 ${currentGameName} の募集は終了しました`;
        color = 0x808080;
        footerText = 'この募集は締め切られました';
    } else if (remaining === 0) {
        title = `🈵 ${currentGameName} 満員御礼！`;
        color = 0xff0000;
        footerText = '定員に達しました';
    }

    return new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .addFields(
            { name: '開始時間', value: startTime, inline: true },
            { name: '募集人数', value: `あと ${remaining} 人 (定員: ${currentMaxPlayers}人)`, inline: true },
            { name: '\u200B', value: '\u200B' }, 
            { name: '現在の参加者', value: participantList }
        )
        .setFooter({ text: footerText });
}

function createButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('join_game')
                .setLabel('参加')
                .setStyle(ButtonStyle.Success)
                .setDisabled(isClosed || participants.length >= currentMaxPlayers),
            new ButtonBuilder()
                .setCustomId('cancel_game')
                .setLabel('キャンセル')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(isClosed),
            new ButtonBuilder()
                .setCustomId('close_game')
                .setLabel('募集を〆る')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isClosed)
        );
}

function createPollEmbed(pollId, pollData) {
    const total = pollData.options.reduce((sum, o) => sum + o.voters.size, 0);
    const fields = pollData.options.map((o, i) => {
        const pct = total > 0 ? Math.round((o.voters.size / total) * 100) : 0;
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        return { name: `${i + 1}. ${o.label}`, value: `${bar} ${o.voters.size}票 (${pct}%)` };
    });

    const status = pollData.closed ? '🔒 終了' : `📊 投票中（計 ${total} 票）`;
    return new EmbedBuilder()
        .setTitle(`📋 ${pollData.question}`)
        .setColor(pollData.closed ? 0x808080 : 0x5865f2)
        .addFields(fields)
        .setFooter({ text: `${status} | ボタンを押して投票（再押しで取消・切替可）` });
}

function createPollButtons(pollId, pollData) {
    const voteRow = new ActionRowBuilder().addComponents(
        pollData.options.map((o, i) =>
            new ButtonBuilder()
                .setCustomId(`poll_vote_${pollId}_${i}`)
                .setLabel(o.label)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pollData.closed)
        )
    );
    const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`poll_close_${pollId}`)
            .setLabel('アンケートを締め切る')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pollData.closed)
    );
    return [voteRow, closeRow];
}

function rollDice(notation) {
    const match = notation.match(/^(\d+)d(\d+)$/i);
    if (!match) return null;
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    if (count < 1 || count > 10 || sides < 2 || sides > 100) return null;
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    return { rolls, total: rolls.reduce((a, b) => a + b, 0), count, sides };
}

client.login(TOKEN);