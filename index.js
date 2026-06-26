require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

http.createServer((_, res) => res.writeHead(200).end('OK')).listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.DISCORD_TOKEN;

let participants = [];
let currentMaxPlayers = 4;
let currentGameName = 'ゲーム';
let startTime = '未定';
let isClosed = false;

let pollCounter = 0;
const polls = new Map();

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === '募集') {
            participants = [];
            isClosed = false;
            currentGameName = interaction.options.getString('ゲーム名');
            currentMaxPlayers = interaction.options.getInteger('人数') ?? 4;
            startTime = interaction.options.getString('開始時間') ?? '未定';
            const mention = interaction.options.getString('メンション') ?? '@here';

            const embed = createEmbed();
            const row = createRecruitButtons();
            const mentionText = mention === 'none' ? '' : mention;

            await interaction.reply({ content: mentionText || undefined, embeds: [embed], components: [row] });
            return;
        }

        if (commandName === 'アンケート') {
            const question = interaction.options.getString('質問');
            const options = ['選択肢1', '選択肢2', '選択肢3', '選択肢4']
                .map(k => interaction.options.getString(k))
                .filter(Boolean);

            const pollId = ++pollCounter;
            const pollData = {
                question,
                options: options.map(label => ({ label, voters: new Set() })),
                closed: false,
            };
            polls.set(pollId, pollData);

            await interaction.reply({ embeds: [createPollEmbed(pollId, pollData)], components: createPollButtons(pollId, pollData) });
            return;
        }

        if (commandName === 'ダイス') {
            const notation = interaction.options.getString('notation') ?? '1d6';
            const result = rollDice(notation);
            if (!result) {
                return interaction.reply({ content: '形式が正しくありません。例: `2d6`（最大10個、最大d100）', flags: MessageFlags.Ephemeral });
            }
            const rollText = result.rolls.length > 1
                ? `[${result.rolls.join(', ')}] → **合計: ${result.total}**`
                : `**${result.total}**`;
            const embed = new EmbedBuilder()
                .setTitle(`🎲 ${result.count}d${result.sides} を振った！`)
                .setDescription(rollText)
                .setColor(0x5865f2);
            return interaction.reply({ embeds: [embed] });
        }

        return;
    }

    if (!interaction.isButton()) return;

    const { customId } = interaction;

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
        participants = participants.filter(u => u !== username);
    }

    if (customId === 'close_game') {
        isClosed = true;
    }

    await interaction.update({ content: '', embeds: [createEmbed()], components: [createRecruitButtons()] });
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
            { name: '​', value: '​' },
            { name: '現在の参加者', value: participantList }
        )
        .setFooter({ text: footerText });
}

function createRecruitButtons() {
    return new ActionRowBuilder().addComponents(
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

client.login(TOKEN).catch(err => {
    console.error('[FATAL] Login failed:', err.message);
    process.exit(1);
});
