// index.js
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { Riffy } = require('riffy');
const config = require('./config.js');
const express = require('express');
require('dotenv').config();

// Function to start Express server
function startExpressServer() {
  if (config.express.enabled) {
    const app = express();

    app.get('/', (req, res) => {
      res.json({
        status: 'online',
        bot: client.user ? client.user.tag : 'Starting...',
        servers: client.guilds ? client.guilds.cache.size : 0,
        uptime: process.uptime(),
        lavalink: isLavalinkConnected ? 'connected' : 'disconnected'
      });
    });

    app.get('/stats', (req, res) => {
      res.json({
        guilds: client.guilds ? client.guilds.cache.size : 0,
        users: client.guilds ? client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0) : 0,
        players: riffy.players ? riffy.players.size : 0,
        uptime: process.uptime(),
        memory: process.memoryUsage().heapUsed / 1024 / 1024,
        ping: client.ws ? client.ws.ping : 0,
        lavalink: isLavalinkConnected
      });
    });

    app.listen(config.express.port, () => {
      console.log(`🌐 Express server running on port ${config.express.port}`);
    });
  }
}

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages
];

if (config.enablePrefix) {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });

let isLavalinkConnected = false;

const riffy = new Riffy(client, config.lavalink.nodes, {
  send: (payload) => {
    const guild = client.guilds.cache.get(payload.d.guild_id);
    if (guild) guild.shard.send(payload);
  },
  defaultSearchPlatform: "ytmsearch",
  restVersion: "v4"
});

const queue247 = new Set();

client.on('ready', async () => {
  console.log(`${config.emojis.success} Logged in as ${client.user.tag}`);

  try {
    riffy.init(client.user.id);
  } catch (error) {
    console.error(`${config.emojis.error} Failed to initialize Riffy:`, error);
  }

  const activityTypes = {
    'PLAYING': ActivityType.Playing,
    'LISTENING': ActivityType.Listening,
    'WATCHING': ActivityType.Watching,
    'STREAMING': ActivityType.Streaming,
    'COMPETING': ActivityType.Competing
  };

  const activityType = activityTypes[config.activity.type] || ActivityType.Listening;
  client.user.setActivity(config.activity.name, { type: activityType });
  console.log(`${config.emojis.success} Activity set: ${config.activity.type} ${config.activity.name}`);

  // Start Express server after bot is ready
  startExpressServer();

  const commands = [
    { name: 'play', description: 'Play a song', options: [{ name: 'query', description: 'Song name or URL', type: 3, required: true }] },
    { name: 'pause', description: 'Pause the current song' },
    { name: 'resume', description: 'Resume the paused song' },
    { name: 'skip', description: 'Skip the current song' },
    { name: 'stop', description: 'Stop the player and clear queue' },
    { name: 'volume', description: 'Set volume', options: [{ name: 'level', description: 'Volume level (1-100)', type: 4, required: true, min_value: 1, max_value: 100 }] },
    { name: 'queue', description: 'Show the current queue' },
    { name: 'nowplaying', description: 'Show currently playing song' },
    { name: 'shuffle', description: 'Shuffle the queue' },
    { name: 'loop', description: 'Toggle loop mode', options: [{ name: 'mode', description: 'Loop mode', type: 3, required: true, choices: [{ name: 'Off', value: 'off' }, { name: 'Track', value: 'track' }, { name: 'Queue', value: 'queue' }] }] },
    { name: 'remove', description: 'Remove a song from queue', options: [{ name: 'position', description: 'Position in queue', type: 4, required: true, min_value: 1 }] },
    { name: 'move', description: 'Move a song in queue', options: [{ name: 'from', description: 'From position', type: 4, required: true, min_value: 1 }, { name: 'to', description: 'To position', type: 4, required: true, min_value: 1 }] },
    { name: 'clearqueue', description: 'Clear the queue' },
    { name: '247', description: 'Toggle 24/7 mode' },
    { name: 'stats', description: 'Show bot statistics' },
    { name: 'ping', description: 'Show bot latency' },
    { name: 'invite', description: 'Get bot invite link' },
    { name: 'support', description: 'Get support server link' },
    { name: 'help', description: 'Show all commands' }
  ];

  await client.application.commands.set(commands);
  console.log(`${config.emojis.success} Slash commands registered globally`);
});

client.on('raw', (d) => riffy.updateVoiceState(d));

riffy.on('nodeConnect', (node) => {
  console.log(`${config.emojis.success} Node ${node.name} connected`);
  isLavalinkConnected = true;
});

riffy.on('nodeError', (node, error) => {
  console.error(`${config.emojis.error} Node ${node.name} error:`, error);
  isLavalinkConnected = false;
});

riffy.on('nodeDisconnect', (node) => {
  console.log(`${config.emojis.error} Node ${node.name} disconnected`);
  isLavalinkConnected = false;
});

const nowPlayingMessages = new Map();

function formatTime(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createNowPlayingContainer(player, track, disabled = false) {
  const info = track.info ?? {};
  let thumbnail = info.artworkUrl || info.thumbnail || null;

  if (!thumbnail && info.uri && info.uri.includes('youtube.com')) {
    const videoId = info.uri.split('v=')[1]?.split('&')[0];
    if (videoId) {
      thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
  }

  if (!thumbnail && info.uri && info.uri.includes('youtu.be')) {
    const videoId = info.uri.split('youtu.be/')[1]?.split('?')[0];
    if (videoId) {
      thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
  }

  if (!thumbnail) {
    thumbnail = 'https://i.imgur.com/QYJfXQv.png';
  }

  const isPaused = player.paused;

  const container = new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${config.emojis.music} Now Playing\n**[${info.title || 'Unknown Title'}](${info.uri || 'https://youtube.com'})**`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(thumbnail)
            .setDescription(info.title || 'Song Thumbnail')
        )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`**Duration:** ${formatTime(info.length || 0)} • **Requested By:** <@${track.info.requester}>`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(isPaused ? 'resume' : 'pause')
            .setEmoji(isPaused ? config.emojis.play : config.emojis.pause)
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId('skip')
            .setEmoji(config.emojis.skip)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId('stop')
            .setEmoji(config.emojis.stop)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId('shuffle')
            .setEmoji(config.emojis.shuffle)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addActionRowComponents(
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('loop')
            .setEmoji(config.emojis.loop)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    );

  return container;
}

function createSimpleContainer(title, description, emoji = config.emojis.info) {
  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${emoji} ${title}\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription(title)
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
}

function createSimpleContainerNoButtons(title, description, emoji = config.emojis.info) {
  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${emoji} ${title}\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription(title)
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
}

function createQueueContainer(player, guild, user) {
  const queue = player.queue ?? [];
  const current = player.current;
  let description = '';

  if (current?.info) {
    description += `**Now Playing:**\n**[${current.info.title}](${current.info.uri})**\n${current.info.author || 'Unknown'} • ${formatTime(current.info.length)} • <@${current.info.requester}>\n\n`;
  }

  if (queue.length > 0) {
    description += `**Up Next:**\n`;
    const upcoming = queue.slice(0, 10);
    upcoming.forEach((t, i) => {
      const inf = t.info || {};
      description += `\`${i + 1}.\` **[${inf.title}](${inf.uri})**\n${inf.author || 'Unknown'} • ${formatTime(inf.length || 0)} • <@${t.info.requester}>\n`;
    });
    if (queue.length > 10) {
      description += `\n*...and ${queue.length - 10} more track(s)*`;
    }
  } else if (!current) {
    description = 'The queue is currently empty.';
  }

  description += `\n\n**Loop:** ${player.loop || 'off'} | **Total:** ${player.queue.length + 1} tracks`;

  let thumbnail = client.user.displayAvatarURL({ size: 1024 });

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${config.emojis.queue} Queue\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(thumbnail)
            .setDescription('Queue')
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
}

function createStatsContainer() {
  const uptime = formatTime(client.uptime);
  const players = riffy.players.size;
  const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
  const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

  const description = `**Servers:** ${client.guilds.cache.size}\n**Users:** ${totalUsers}\n**Players:** ${players}\n**Uptime:** ${uptime}\n**Ping:** ${client.ws.ping}ms\n**Memory:** ${memory} MB`;

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${config.emojis.info} Bot Statistics\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription('Bot Avatar')
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
}

function createHelpContainer() {
  const lavalinkStatus = isLavalinkConnected ? '🟢 Connected' : '🔴 Not Connected';

  const description = `A powerful music bot with high quality audio\n\n**Total Commands:** 17\n**Prefix:** \`${config.prefix}\`\n**Lavalink:** ${lavalinkStatus}\nMade by **Unknownz**\n\n**${config.emojis.music} Music Commands**\n**play** (p) - Play a song\n**pause** (pa) - Pause current song\n**resume** (r, res) - Resume playback\n**skip** (s, next) - Skip current song\n**stop** (st, leave) - Stop player\n**nowplaying** (np) - Show current song\n**queue** (q) - Show queue\n**loop** (l, repeat) - Loop mode\n**shuffle** (sh, mix) - Shuffle queue\n**volume** (v, vol) - Set volume\n**clearqueue** (cq, clear) - Clear queue\n**remove** (rm, delete) - Remove from queue\n**move** (mv) - Move in queue\n**247** (24/7, stay) - Toggle 24/7\n\n**${config.emojis.info} Utility Commands**\n**stats** (status, info) - Bot stats\n**ping** (latency) - Bot ping\n**invite** (inv) - Invite link\n**support** (server) - Support server\n**help** (h, cmd) - This message`;

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${client.user.username} Help\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription('Bot Avatar')
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Invite Me')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=3165184&scope=bot%20applications.commands`),
          new ButtonBuilder()
            .setLabel('Support')
            .setStyle(ButtonStyle.Link)
            .setURL(config.supportServer)
        )
    );
}

riffy.on('trackStart', async (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);
  if (!channel) return;

  const container = createNowPlayingContainer(player, track);

  try {
    const msg = await channel.send({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    nowPlayingMessages.set(player.guildId, msg);
  } catch (err) {
    console.error('Failed to send Now Playing message:', err);
  }
});

riffy.on('queueEnd', async (player) => {
  const channel = client.channels.cache.get(player.textChannel);

  const msg = nowPlayingMessages.get(player.guildId);
  if (msg && player.current) {
    try {
      const disabledContainer = createNowPlayingContainer(player, player.current, true);
      await msg.edit({ components: [disabledContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    } catch (error) {
      console.error('Failed to disable buttons:', error);
    }
    nowPlayingMessages.delete(player.guildId);
  }

  if (queue247.has(player.guildId)) {
    if (channel) {
      const container = createSimpleContainerNoButtons('24/7 Mode', 'Queue ended but staying in 24/7 mode', config.emojis.info);
      await channel.send({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    }
    return;
  }

  if (channel) {
    const container = createSimpleContainerNoButtons('Queue Ended', 'Queue ended, leaving voice channel', config.emojis.success);
    await channel.send({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
  }

  player.destroy();
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const player = riffy.players.get(interaction.guildId);

    if (!player) {
      return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
    }

    const member = interaction.member;
    if (!member.voice.channel) {
      return interaction.reply({ content: `${config.emojis.error} You need to be in a voice channel`, ephemeral: true });
    }

    if (member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    switch (interaction.customId) {
      case 'pause':
      case 'resume': {
        const message = nowPlayingMessages.get(player.guildId);
        const shouldPause = interaction.customId === 'pause';
        await player.pause(shouldPause);

        if (message && player.current) {
          const updatedContainer = createNowPlayingContainer(player, player.current);
          await message.edit({ components: [updatedContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 }).catch(() => {});
        }

        await interaction.reply({ 
          content: shouldPause ? `${config.emojis.pause} Paused` : `${config.emojis.play} Resumed`, 
          ephemeral: true 
        });
        break;
      }

      case 'skip': {
        player.stop();
        const disabledContainer = createNowPlayingContainer(player, player.current, true);
        await interaction.message.edit({ components: [disabledContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
        await interaction.reply({ content: `${config.emojis.skip} Skipped`, ephemeral: true });
        break;
      }

      case 'stop': {
        const disabledContainer = createNowPlayingContainer(player, player.current, true);
        await interaction.message.edit({ components: [disabledContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
        player.destroy();
        await interaction.reply({ content: `${config.emojis.stop} Stopped`, ephemeral: true });
        break;
      }

      case 'shuffle': {
        if (player.queue.length === 0) {
          return interaction.reply({ content: `${config.emojis.error} Queue is empty`, ephemeral: true });
        }
        player.queue.shuffle();
        await interaction.reply({ content: `${config.emojis.shuffle} Shuffled queue`, ephemeral: true });
        break;
      }

      case 'loop': {
        const modes = ['off', 'track', 'queue'];
        const currentMode = player.loop || 'off';
        const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length];
        player.setLoop(nextMode);
        await interaction.reply({ content: `${config.emojis.loop} Loop set to: ${nextMode}`, ephemeral: true });
        break;
      }

      case 'queue': {
        const queueContainer = createQueueContainer(player, interaction.guild, interaction.user);
        await interaction.reply({ components: [queueContainer], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        break;
      }
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild, channel } = interaction;

  if (commandName === 'play') {
    const query = options.getString('query');

    if (!member.voice.channel) {
      return interaction.reply({ content: `${config.emojis.error} You need to be in a voice channel`, ephemeral: true });
    }

    if (!isLavalinkConnected) {
      return interaction.reply({ content: `${config.emojis.error} Lavalink is not connected. Music commands are unavailable.`, ephemeral: true });
    }

    await interaction.deferReply();

    try {
      let player = riffy.players.get(guild.id);

      if (!player) {
        player = riffy.createConnection({
          guildId: guild.id,
          voiceChannel: member.voice.channel.id,
          textChannel: channel.id,
          deaf: true
        });
      }

      const resolve = await riffy.resolve({ query, requester: member.user.id });

      if (!resolve || !resolve.tracks.length) {
        return interaction.editReply({ content: `${config.emojis.error} No results found` });
      }

      if (resolve.loadType === 'playlist') {
        for (const track of resolve.tracks) {
          track.info.requester = member.user.id;
          player.queue.add(track);
        }

        const container = createSimpleContainerNoButtons(
          'Playlist Added',
          `Added playlist **${resolve.playlistInfo.name}** (${resolve.tracks.length} tracks)`,
          config.emojis.success
        );

        await interaction.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
      } else {
        const track = resolve.tracks[0];
        track.info.requester = member.user.id;
        player.queue.add(track);

        const container = createSimpleContainerNoButtons(
          'Added to Queue',
          `[${track.info.title}](${track.info.uri})`,
          config.emojis.success
        );

        await interaction.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
      }

      if (!player.playing && !player.paused) player.play();
    } catch (error) {
      console.error('Play command error:', error);
      await interaction.editReply({ content: `${config.emojis.error} An error occurred while playing the song` });
    }
  }

  if (commandName === 'pause') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    player.pause(true);
    const container = createSimpleContainer('Paused', 'Playback paused', config.emojis.pause);
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'resume') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    player.pause(false);
    const container = createSimpleContainer('Resumed', 'Playback resumed', config.emojis.play);
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'skip') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    player.stop();
    const container = createSimpleContainer('Skipped', 'Skipped to next track', config.emojis.skip);
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'stop') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    player.destroy();
    const container = createSimpleContainer('Stopped', 'Stopped and cleared queue', config.emojis.stop);
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'volume') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    const volume = options.getInteger('level');
    player.setVolume(volume);
    const container = createSimpleContainer('Volume Set', `Volume set to ${volume}%`, config.emojis.volume);
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'queue') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });

    if (player.queue.length === 0 && !player.current) {
      return interaction.reply({ content: `${config.emojis.error} Queue is empty`, ephemeral: true });
    }

    const queueContainer = createQueueContainer(player, guild, interaction.user);
    await interaction.reply({ components: [queueContainer], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'nowplaying') {
    const player = riffy.players.get(guild.id);
    if (!player || !player.current) {
      return interaction.reply({ content: `${config.emojis.error} Nothing is playing`, ephemeral: true });
    }

    const info = player.current.info ?? {};
    let thumbnail = info.artworkUrl || info.thumbnail || null;

    if (!thumbnail && info.uri && info.uri.includes('youtube.com')) {
      const videoId = info.uri.split('v=')[1]?.split('&')[0];
      if (videoId) {
        thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }

    if (!thumbnail && info.uri && info.uri.includes('youtu.be')) {
      const videoId = info.uri.split('youtu.be/')[1]?.split('?')[0];
      if (videoId) {
        thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }

    if (!thumbnail) {
      thumbnail = 'https://i.imgur.com/QYJfXQv.png';
    }

    const currentPosition = player.position || 0;
    const totalDuration = info.length || 0;
    const status = player.paused ? '⏸️ Paused' : '▶️ Playing';

          const description = `**[${info.title || 'Unknown Title'}](${info.uri || 'https://youtube.com'})**\n\n**Status:** ${status}\n**Current Duration:** ${formatTime(currentPosition)} / ${formatTime(totalDuration)}\n**Requested By:** <@${player.current.info.requester}>\n**Loop:** ${player.loop || 'off'}`;

          const container = new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder()
                    .setContent(`## ${config.emojis.music} Now Playing\n${description}`)
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(thumbnail)
                    .setDescription(info.title || 'Song Thumbnail')
                )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'shuffle') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }
          if (player.queue.length === 0) {
            return interaction.reply({ content: `${config.emojis.error} Queue is empty`, ephemeral: true });
          }

          player.queue.shuffle();
          const container = createSimpleContainer('Shuffled', 'Shuffled the queue', config.emojis.shuffle);
          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'loop') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }

          const mode = options.getString('mode');
          player.setLoop(mode);
          const container = createSimpleContainer('Loop Set', `Loop set to: ${mode}`, config.emojis.loop);
          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'remove') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }

          const position = options.getInteger('position') - 1;
          if (position < 0 || position >= player.queue.length) {
            return interaction.reply({ content: `${config.emojis.error} Invalid position`, ephemeral: true });
          }

          const removed = player.queue.remove(position);
          const container = createSimpleContainer('Removed', `Removed: ${removed.info.title}`, config.emojis.success);
          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'move') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }

          const from = options.getInteger('from') - 1;
          const to = options.getInteger('to') - 1;

          if (from < 0 || from >= player.queue.length || to < 0 || to >= player.queue.length) {
            return interaction.reply({ content: `${config.emojis.error} Invalid positions`, ephemeral: true });
          }

          const track = player.queue.remove(from);
          player.queue.splice(to, 0, track);
          const container = createSimpleContainer('Moved', `Moved: ${track.info.title}`, config.emojis.success);
          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'clearqueue') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.reply({ content: `${config.emojis.error} No player found`, ephemeral: true });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }

          player.queue.clear();
          const container = createSimpleContainer('Queue Cleared', 'Cleared the queue', config.emojis.success);
          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === '247') {
          const player = riffy.players.get(guild.id);
          if (!member.voice.channel) {
            return interaction.reply({ content: `${config.emojis.error} You need to be in a voice channel`, ephemeral: true });
          }

          if (queue247.has(guild.id)) {
            queue247.delete(guild.id);
            const container = createSimpleContainer('24/7 Disabled', '24/7 mode disabled', config.emojis.success);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          } else {
            queue247.add(guild.id);

            if (!player) {
              riffy.createConnection({
                guildId: guild.id,
                voiceChannel: member.voice.channel.id,
                textChannel: channel.id,
                deaf: true
              });
            }

            const container = createSimpleContainer('24/7 Enabled', '24/7 mode enabled', config.emojis.success);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }
        }

        if (commandName === 'stats') {
          const statsContainer = createStatsContainer();
          await interaction.reply({ components: [statsContainer], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'ping') {
          const container = createSimpleContainer('Pong!', `Latency: ${client.ws.ping}ms`, config.emojis.info);
          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'invite') {
          const invite = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=3165184&scope=bot%20applications.commands`;

          const container = new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder()
                    .setContent(`## ${config.emojis.success} Invite Bot\n[Click here to invite me](${invite})`)
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(client.user.displayAvatarURL({ size: 1024 }))
                    .setDescription('Invite Bot')
                )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addActionRowComponents(
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setLabel('Invite Me')
                    .setStyle(ButtonStyle.Link)
                    .setURL(invite)
                )
            );

          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'support') {
          const container = new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder()
                    .setContent(`## ${config.emojis.info} Support Server\n[Join our support server](${config.supportServer})`)
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(client.user.displayAvatarURL({ size: 1024 }))
                    .setDescription('Support Server')
                )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addActionRowComponents(
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setLabel('Support')
                    .setStyle(ButtonStyle.Link)
                    .setURL(config.supportServer)
                )
            );

          await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'help') {
          const helpContainer = createHelpContainer();
          await interaction.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
        }
      });

      if (config.enablePrefix) {
        client.on('messageCreate', async (message) => {
          if (message.author.bot || !message.guild) return;
          if (!message.content.startsWith(config.prefix)) return;

          const args = message.content.slice(config.prefix.length).trim().split(/ +/);
          let command = args.shift().toLowerCase();

          for (const [cmd, aliases] of Object.entries(config.aliases)) {
            if (aliases.includes(command)) {
              command = cmd;
              break;
            }
          }

          if (command === 'play') {
            const query = args.join(' ');
            if (!query) return message.reply(`${config.emojis.error} Please provide a song name or URL`);

            if (!message.member.voice.channel) {
              return message.reply(`${config.emojis.error} You need to be in a voice channel`);
            }

            if (!isLavalinkConnected) {
              return message.reply(`${config.emojis.error} Lavalink is not connected. Music commands are unavailable.`);
            }

            try {
              let player = riffy.players.get(message.guild.id);

              if (!player) {
                player = riffy.createConnection({
                  guildId: message.guild.id,
                  voiceChannel: message.member.voice.channel.id,
                  textChannel: message.channel.id,
                  deaf: true
                });
              }

              const resolve = await riffy.resolve({ query, requester: message.author.id });

              if (!resolve || !resolve.tracks.length) {
                return message.reply(`${config.emojis.error} No results found`);
              }

              if (resolve.loadType === 'playlist') {
                for (const track of resolve.tracks) {
                  track.info.requester = message.author.id;
                  player.queue.add(track);
                }

                const container = createSimpleContainerNoButtons(
                  'Playlist Added',
                  `Added playlist **${resolve.playlistInfo.name}** (${resolve.tracks.length} tracks)`,
                  config.emojis.success
                );

                await message.reply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
              } else {
                const track = resolve.tracks[0];
                track.info.requester = message.author.id;
                player.queue.add(track);

                const container = createSimpleContainerNoButtons(
                  'Added to Queue',
                  `[${track.info.title}](${track.info.uri})`,
                  config.emojis.success
                );

                await message.reply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
              }

              if (!player.playing && !player.paused) player.play();
            } catch (error) {
              console.error('Play command error:', error);
              await message.reply(`${config.emojis.error} An error occurred while playing the song`);
            }
          }

          if (command === 'pause') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.pause(true);
            const container = createSimpleContainer('Paused', 'Playback paused', config.emojis.pause);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'resume') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.pause(false);
            const container = createSimpleContainer('Resumed', 'Playback resumed', config.emojis.play);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'skip') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.stop();
            const container = createSimpleContainer('Skipped', 'Skipped to next track', config.emojis.skip);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'stop') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.destroy();
            const container = createSimpleContainer('Stopped', 'Stopped and cleared queue', config.emojis.stop);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'volume') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            const volume = parseInt(args[0]);
            if (isNaN(volume) || volume < 1 || volume > 100) {
              return message.reply(`${config.emojis.error} Please provide a volume between 1-100`);
            }

            player.setVolume(volume);
            const container = createSimpleContainer('Volume Set', `Volume set to ${volume}%`, config.emojis.volume);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'queue') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);

            if (player.queue.length === 0 && !player.current) {
              return message.reply(`${config.emojis.error} Queue is empty`);
            }

            const queueContainer = createQueueContainer(player, message.guild, message.author);
            await message.reply({ components: [queueContainer], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'nowplaying') {
            const player = riffy.players.get(message.guild.id);
            if (!player || !player.current) {
              return message.reply(`${config.emojis.error} Nothing is playing`);
            }

            const info = player.current.info ?? {};
            let thumbnail = info.artworkUrl || info.thumbnail || null;

            if (!thumbnail && info.uri && info.uri.includes('youtube.com')) {
              const videoId = info.uri.split('v=')[1]?.split('&')[0];
              if (videoId) {
                thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              }
            }

            if (!thumbnail && info.uri && info.uri.includes('youtu.be')) {
              const videoId = info.uri.split('youtu.be/')[1]?.split('?')[0];
              if (videoId) {
                thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              }
            }

            if (!thumbnail) {
              thumbnail = 'https://i.imgur.com/QYJfXQv.png';
            }

            const currentPosition = player.position || 0;
            const totalDuration = info.length || 0;
            const status = player.paused ? '⏸️ Paused' : '▶️ Playing';

            const description = `**[${info.title || 'Unknown Title'}](${info.uri || 'https://youtube.com'})**\n\n**Status:** ${status}\n**Current Duration:** ${formatTime(currentPosition)} / ${formatTime(totalDuration)}\n**Requested By:** <@${player.current.info.requester}>\n**Loop:** ${player.loop || 'off'}`;

            const container = new ContainerBuilder()
              .addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(
                    new TextDisplayBuilder()
                      .setContent(`## ${config.emojis.music} Now Playing\n${description}`)
                  )
                  .setThumbnailAccessory(
                    new ThumbnailBuilder()
                      .setURL(thumbnail)
                      .setDescription(info.title || 'Song Thumbnail')
                  )
              )
              .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
              );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'shuffle') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }
            if (player.queue.length === 0) {
              return message.reply(`${config.emojis.error} Queue is empty`);
            }

            player.queue.shuffle();
            const container = createSimpleContainer('Shuffled', 'Shuffled the queue', config.emojis.shuffle);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'loop') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            const mode = args[0]?.toLowerCase();
            if (!mode || !['off', 'track', 'queue'].includes(mode)) {
              return message.reply(`${config.emojis.error} Please specify: off, track, or queue`);
            }

            player.setLoop(mode);
            const container = createSimpleContainer('Loop Set', `Loop set to: ${mode}`, config.emojis.loop);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'remove') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            const position = parseInt(args[0]) - 1;
            if (isNaN(position) || position < 0 || position >= player.queue.length) {
              return message.reply(`${config.emojis.error} Invalid position`);
            }

            const removed = player.queue.remove(position);
            const container = createSimpleContainer('Removed', `Removed: ${removed.info.title}`, config.emojis.success);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'move') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            const from = parseInt(args[0]) - 1;
            const to = parseInt(args[1]) - 1;

            if (isNaN(from) || isNaN(to) || from < 0 || from >= player.queue.length || to < 0 || to >= player.queue.length) {
              return message.reply(`${config.emojis.error} Invalid positions`);
            }

            const track = player.queue.remove(from);
            player.queue.splice(to, 0, track);
            const container = createSimpleContainer('Moved', `Moved: ${track.info.title}`, config.emojis.success);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'clearqueue') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.queue.clear();
            const container = createSimpleContainer('Queue Cleared', 'Cleared the queue', config.emojis.success);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === '247') {
            if (!message.member.voice.channel) {
              return message.reply(`${config.emojis.error} You need to be in a voice channel`);
            }

            if (queue247.has(message.guild.id)) {
              queue247.delete(message.guild.id);
              const container = createSimpleContainer('24/7 Disabled', '24/7 mode disabled', config.emojis.success);
              await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
              queue247.add(message.guild.id);

              let player = riffy.players.get(message.guild.id);
              if (!player) {
                riffy.createConnection({
                  guildId: message.guild.id,
                  voiceChannel: message.member.voice.channel.id,
                  textChannel: message.channel.id,
                  deaf: true
                });
              }

              const container = createSimpleContainer('24/7 Enabled', '24/7 mode enabled', config.emojis.success);
              await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
          }

          if (command === 'stats') {
            const statsContainer = createStatsContainer();
            await message.reply({ components: [statsContainer], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'ping') {
            const container = createSimpleContainer('Pong!', `Latency: ${client.ws.ping}ms`, config.emojis.info);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'invite') {
            const invite = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=3165184&scope=bot%20applications.commands`;

            const container = new ContainerBuilder()
              .addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(
                    new TextDisplayBuilder()
                      .setContent(`## ${config.emojis.success} Invite Bot\n[Click here to invite me](${invite})`)
                  )
                  .setThumbnailAccessory(
                    new ThumbnailBuilder()
                      .setURL(client.user.displayAvatarURL({ size: 1024 }))
                      .setDescription('Invite Bot')
                  )
              )
              .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
              )
              .addActionRowComponents(
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setLabel('Invite Me')
                      .setStyle(ButtonStyle.Link)
                      .setURL(invite)
                  )
              );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'support') {
            const container = new ContainerBuilder()
              .addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(
                    new TextDisplayBuilder()
                      .setContent(`## ${config.emojis.info} Support Server\n[Join our support server](${config.supportServer})`)
                  )
                  .setThumbnailAccessory(
                    new ThumbnailBuilder()
                      .setURL(client.user.displayAvatarURL({ size: 1024 }))
                      .setDescription('Support Server')
                  )
              )
              .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
              )
              .addActionRowComponents(
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setLabel('Support')
                      .setStyle(ButtonStyle.Link)
                      .setURL(config.supportServer)
                  )
              );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'help') {
            const helpContainer = createHelpContainer();
            await message.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
          }
        });
      }

      client.login(config.token);

