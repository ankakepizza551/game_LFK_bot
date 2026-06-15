require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const TOKEN = process.env.DISCORD_TOKEN;

let participants = [];
let currentMaxPlayers = 4;
let currentGameName = 'ゲーム';
let startTime = '未定';
let isClosed = false;

client.on('messageCreate', async (message) => {
    const args = message.content.trim().split(/[\s ]+/);
    const command = args[0];

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

    if (isClosed) {
        return interaction.reply({ content: 'この募集はすでに終了しています。', ephemeral: true });
    }

    const username = interaction.user.username;

    if (interaction.customId === 'join_game') {
        if (participants.includes(username)) {
            return interaction.reply({ content: 'すでに入っています！', ephemeral: true });
        }
        if (participants.length >= currentMaxPlayers) {
            return interaction.reply({ content: 'もう満員です！', ephemeral: true });
        }
        participants.push(username);
    } 
    
    if (interaction.customId === 'cancel_game') {
        if (!participants.includes(username)) {
            return interaction.reply({ content: 'まだ参加していません。', ephemeral: true });
        }
        participants = participants.filter(user => user !== username);
    }

    if (interaction.customId === 'close_game') {
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

client.login(TOKEN);