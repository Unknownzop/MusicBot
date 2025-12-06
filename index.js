require('dotenv').config();
const config = require('./config');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActivityType, 
  StringSelectMenuBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  MessageFlags
} = require('discord.js');

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Discord Music Bot is running!');
});

app.listen(config.express.port, config.express.host, () => {
  console.log(`Express server running on port ${config.express.port}`);
});

const { Riffy } = require('riffy');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
];

if (config.enablePrefix) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });

const riffy = new Riffy(client, config.lavalink.nodes, {
  defaultSearchPlatform: 'ytmsearch', // Force YouTube Music as default search platform
  restVersion: 'v4',
  send: (payload) => {
    const guild = client.guilds.cache.get(payload.d.guild_id);
    if (guild) guild.shard.send(payload);
  }
});

async function searchTrack(query, requester) {
  try {
    if (query.startsWith('http')) {
      try {
        const res = await riffy.resolve({ query: query, requester: requester });
        if (res && res.tracks && Array.isArray(res.tracks) && res.tracks.length > 0) {
          return res;
        }
      } catch (urlError) {
      }
    }

    const cleanQuery = query.replace(/^(ytmsearch:|ytsearch:|scsearch:)/, '').trim();

    if (!cleanQuery) {
      return { loadType: 'empty', tracks: [] };
    }

    const searchFormats = [
      `ytmsearch:${cleanQuery}`,
      `ytsearch:${cleanQuery}`,
      cleanQuery
    ];

    for (const searchQuery of searchFormats) {
      try {
        const res = await riffy.resolve({ query: searchQuery, requester: requester });

        if (res && res.loadType && res.loadType !== 'error' && res.loadType !== 'empty') {
          if (res.tracks && Array.isArray(res.tracks) && res.tracks.length > 0) {
            return res;
          }
        }

        if (res?.loadType === 'error') {
          continue;
        }
      } catch (searchError) {
        continue;
      }
    }

    return { loadType: 'empty', tracks: [] };

  } catch (error) {
    return { loadType: 'empty', tracks: [] };
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song')
    .addStringOption(option => 
      option.setName('query')
        .setDescription('Song name or URL')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song'),
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the current song'),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip to the next song'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue'),
  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show currently playing song'),
  new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the queue'),
  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Toggle loop mode')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Track', value: 'track' },
          { name: 'Queue', value: 'queue' }
        )),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a song from the queue')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('Position in queue')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a song to a different position')
    .addIntegerOption(option =>
      option.setName('from')
        .setDescription('From position')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('to')
        .setDescription('To position')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('clearqueue')
    .setDescription('Clear the queue'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops the music and leaves'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the volume')
    .addIntegerOption(option =>
      option.setName('level')
        .setDescription('Volume level (0-100)')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggle 24/7 mode'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all commands'),
  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get bot invite link'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Shows bot ping'),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Shows bot statistics'),
  new SlashCommandBuilder()
    .setName('support')
    .setDescription('Join our support server'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Initialize Riffy with bot user ID
  riffy.init(client.user.id);

  const activityType = ActivityType[config.activity.type] || ActivityType.Listening;
  client.user.setActivity(config.activity.name, { type: activityType });

  try {
    console.log('Refreshing slash commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }

  console.log(`Prefix commands: ${config.enablePrefix ? 'Enabled' : 'Disabled'}`);
  if (config.enablePrefix) {
    console.log(`Prefix: ${config.prefix}`);
  }
});

function formatDuration(duration) {
  if (!duration || duration === 0) return 'Unknown';
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createMusicContainer(track) {
  const container = new ContainerBuilder()
    .setAccentColor(0xFF0000);

  const thumbnail = track.info?.artworkUrl || track.thumbnail || track.artworkUrl;
  const trackTitle = track.info?.title || track.title || 'Unknown';
  const trackUri = track.info?.uri || track.uri || '#';
  const trackAuthor = track.info?.author || track.author || 'Unknown';
  const trackDuration = track.info?.length || track.length || track.duration || 0;

  if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
        new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
        new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
      new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
      new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
    );
  }

  const buttonRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pause_resume')
        .setLabel('⏯️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('skip')
        .setLabel('⏭️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('stop')
        .setLabel('⏹️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('loop')
        .setLabel('🔄')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('queue')
        .setLabel('📜')
        .setStyle(ButtonStyle.Secondary)
    );

  container.addActionRowComponents(buttonRow);

  return container;
}



function createSimpleContainer(content, color = 0xFF0000) {
  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content)
    );
}

function createContainerWithFooter(content, user, color = 0xFF0000) {
  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content)
    );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Requested by ${user.tag}`)
  );

  return container;
}

async function handlePrefixCommand(message) {
  if (!config.enablePrefix) return;
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const mockInteraction = {
    member: message.member,
    user: message.author,
    guild: message.guild,
    channel: message.channel,
    options: {
      getString: (name) => args.join(' '),
      getInteger: (name) => parseInt(args[0]) || 0
    },
    reply: async (content) => message.reply(content),
    editReply: async (content) => message.reply(content),
    deferReply: async () => {},
    replied: false,
    deferred: false
  };

  switch (command) {
    case 'play':
      if (args.length === 0) return message.reply('Please provide a song name or URL!');
      await handlePlayCommand(mockInteraction, args.join(' '));
      break;
    case 'pause':
      await handlePauseCommand(mockInteraction);
      break;
    case 'resume':
      await handleResumeCommand(mockInteraction);
      break;
    case 'skip':
      await handleSkipCommand(mockInteraction);
      break;
    case 'queue':
      await handleQueueCommand(mockInteraction);
      break;
    case 'nowplaying':
    case 'np':
      await handleNowPlayingCommand(mockInteraction);
      break;
    case 'shuffle':
      await handleShuffleCommand(mockInteraction);
      break;
    case 'loop':
      await handleLoopCommand(mockInteraction, args[0] || 'track');
      break;
    case 'remove':
      if (!args[0]) return message.reply('Please provide a position!');
      await handleRemoveCommand(mockInteraction, parseInt(args[0]));
      break;
    case 'move':
      if (!args[0] || !args[1]) return message.reply('Please provide from and to positions!');
      await handleMoveCommand(mockInteraction, parseInt(args[0]), parseInt(args[1]));
      break;
    case 'clearqueue':
    case 'clear':
      await handleClearQueueCommand(mockInteraction);
      break;
    case 'stop':
      await handleStopCommand(mockInteraction);
      break;
    case 'volume':
    case 'vol':
      if (!args[0]) return message.reply('Please provide a volume level (0-100)!');
      await handleVolumeCommand(mockInteraction, parseInt(args[0]));
      break;
    case '247':
      await handle247Command(mockInteraction);
      break;
    case 'help':
      await handleHelpCommand(mockInteraction);
      break;
    case 'invite':
      await handleInviteCommand(mockInteraction);
      break;
    case 'ping':
      await handlePingCommand(mockInteraction);
      break;
    case 'stats':
      await handleStatsCommand(mockInteraction);
      break;
    case 'support':
      await handleSupportCommand(mockInteraction);
      break;
  }
}

async function handlePlayCommand(interaction, query) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';

  if (!interaction.member.voice.channel) {
    return interaction[replyMethod]({ content: 'Join a voice channel first!' });
  }

  try {
    const nodes = riffy.nodes instanceof Map ? Array.from(riffy.nodes.values()) : Array.isArray(riffy.nodes) ? riffy.nodes : Object.values(riffy.nodes || {});

    if (!nodes || nodes.length === 0) {
      const container = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${config.emojis.error} Connection Error`),
          new TextDisplayBuilder().setContent('No Lavalink nodes are configured. Please check your configuration.')
        );
      return interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  } catch (error) {
  }

  let player = riffy.players.get(interaction.guild.id);

  if (!player) {
    try {
      player = riffy.createConnection({
        guildId: interaction.guild.id,
        voiceChannel: interaction.member.voice.channel.id,
        textChannel: interaction.channel.id,
        deaf: true
      });
    } catch (createError) {
      const container = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${config.emojis.error} Player Error`),
          new TextDisplayBuilder().setContent('Failed to create music player. Please try again.')
        );
      return interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  }

  // Ensure player.data is always a Map
  if (!player.data || !(player.data instanceof Map)) {
    player.data = new Map();
  }

  if (player.voiceChannel !== interaction.member.voice.channel.id) {
    player.setVoiceChannel(interaction.member.voice.channel.id);
  }

  if (!player.twentyFourSeven) player.twentyFourSeven = false;

  try {
    const res = await searchTrack(query, interaction.user);

    if (!res || res.loadType === 'empty' || !res.tracks || !res.tracks.length) {
      const container = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${config.emojis.error} No Results Found`),
          new TextDisplayBuilder().setContent('No tracks found for your search query. Please try:\n• Different keywords\n• Artist name + song title\n• A direct URL')
        );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Requested by ${interaction.user.tag}`)
      );
      return interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (res.loadType === 'playlist') {
      const playlist = res.playlistInfo || res.playlist;
      const tracks = res.tracks;

      tracks.forEach(track => {
        if (!track.requester) track.requester = interaction.user;
        player.queue.add(track);
      });

      const container = new ContainerBuilder()
        .setAccentColor(0x1DB954);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${config.emojis.playlist} Playlist Added`),
        new TextDisplayBuilder().setContent(`Added **${tracks.length}** tracks from [${playlist?.name || 'Playlist'}](${query})`)
      );

      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${config.emojis.music} **First Track:** [${tracks[0].info?.title || tracks[0].title}](${tracks[0].info?.uri || tracks[0].uri})`),
        new TextDisplayBuilder().setContent(`${config.emojis.duration} **Total Duration:** ${formatDuration(tracks.reduce((acc, track) => acc + (track.info?.length || track.length || 0), 0))}`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Requested by ${interaction.user.tag}`)
      );

      await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
      const track = res.tracks[0];
      if (!track.requester) track.requester = interaction.user;
      player.queue.add(track);

      const container = new ContainerBuilder()
        .setAccentColor(0x1DB954);

      const thumbnail = track.info?.artworkUrl || track.thumbnail || track.artworkUrl;
      const trackTitle = track.info?.title || track.title || 'Unknown';
      const trackUri = track.info?.uri || track.uri || '#';
      const trackAuthor = track.info?.author || track.author || 'Unknown';
      const trackDuration = track.info?.length || track.length || track.duration || 0;

      if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${config.emojis.success} Track Added`),
            new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
            new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)} • ${config.emojis.position} #${player.queue.size}`)
          )
          .setThumbnailAccessory(
            thumb => thumb
              .setURL(thumbnail)
              .setDescription(trackTitle)
          );
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${config.emojis.success} Track Added`),
          new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
          new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)} • ${config.emojis.position} #${player.queue.size}`)
        );
      }
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Requested by ${interaction.user.tag}`)
      );

      await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (!player.playing && !player.paused) {
      try {
        await player.play();

        // Send now playing embed with pause button after starting playback
        setTimeout(async () => {
          const currentTrack = player.current || player.queue.current;
          if (currentTrack && interaction.channel) {
            const npContainer = new ContainerBuilder()
              .setAccentColor(0xFF0000);

            const thumbnail = currentTrack.info?.artworkUrl || currentTrack.thumbnail || currentTrack.artworkUrl;
            const trackTitle = currentTrack.info?.title || currentTrack.title || 'Unknown';
            const trackUri = currentTrack.info?.uri || currentTrack.uri || '#';
            const trackAuthor = currentTrack.info?.author || currentTrack.author || 'Unknown';
            const trackDuration = currentTrack.info?.length || currentTrack.length || currentTrack.duration || 0;

            if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
              const section = new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
                  new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
                  new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
                )
                .setThumbnailAccessory(
                  thumb => thumb
                    .setURL(thumbnail)
                    .setDescription(trackTitle)
                );
              npContainer.addSectionComponents(section);
            } else {
              npContainer.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
                new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
                new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
              );
            }

            const buttonRow = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('pause_resume')
                  .setLabel('⏸️')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId('skip')
                  .setLabel('⏭️')
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId('stop')
                  .setLabel('⏹️')
                  .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                  .setCustomId('loop')
                  .setLabel('🔄')
                  .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                  .setCustomId('queue')
                  .setLabel('📜')
                  .setStyle(ButtonStyle.Secondary)
              );

            npContainer.addActionRowComponents(buttonRow);

            await interaction.channel.send({ 
              components: [npContainer], 
              flags: MessageFlags.IsComponentsV2 
            }).catch(console.error);
          }
        }, 500);
      } catch (playError) {
        const container = createContainerWithFooter(
          `## ${config.emojis.error} Playback Error\nFailed to start playback. Please try again or check if the bot has proper permissions.`,
          interaction.user,
          0xFF0000
        );
        await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
    }

  } catch (error) {
    const errorMessage = error.message || 'Unknown error occurred';
    const container = new ContainerBuilder()
      .setAccentColor(0xFF0000)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${config.emojis.error} Search Failed`),
        new TextDisplayBuilder().setContent(`Failed to search for tracks: ${errorMessage}\n\n**Suggestions:**\n• Try a different search term\n• Use artist name + song title\n• Try a direct YouTube/Spotify URL\n• Check if Lavalink node is online`)
      );
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${interaction.user.tag}`)
    );

    try {
      await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (replyError) {
      try {
        await interaction[replyMethod]({ content: `❌ Error: ${errorMessage}` });
      } catch (fallbackError) {
      }
    }
  }
}

async function handlePauseCommand(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  player.pause(true);
  const container = createContainerWithFooter(`${config.emojis.pause} Paused`, interaction.user);
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleResumeCommand(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  player.pause(false);
  const container = createContainerWithFooter(`${config.emojis.resume} Resumed`, interaction.user);
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleSkipCommand(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  // Ensure player.data is a Map
  if (!player.data || !(player.data instanceof Map)) {
    player.data = new Map();
  }

  const container = createContainerWithFooter(`${config.emojis.skip} Skipped`, interaction.user);
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });

  if (player.queue.size === 0) {
    player.data.set('manualStop', true);
    const endContainer = createSimpleContainer(`${config.emojis.music} Queue has ended!`);
    await interaction.channel.send({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });
  }

  player.stop();
}

async function handleQueueCommand(interaction) {
  const player = riffy.players.get(interaction.guild.id);
  if (!player) {
    const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
    return interaction[replyMethod]({ content: 'Not playing anything!' });
  }

  const queue = player.queue;
  const currentTrack = player.current || player.queue.current;

  // Limit queue display to prevent overflow
  const maxQueueDisplay = 10;
  const queueTracks = queue.size > 0 
    ? queue.slice(0, maxQueueDisplay).map((track, i) =>
        `${i + 1}. [${track.info?.title || track.title}](${track.info?.uri || track.uri})`).join('\n')
    : 'No songs in queue';

  const moreTracksText = queue.size > maxQueueDisplay 
    ? `\n\n*...and ${queue.size - maxQueueDisplay} more tracks*` 
    : '';

  let description = queueTracks + moreTracksText;

  if (currentTrack) {
    description = `**Now Playing:**\n[${currentTrack.info?.title || currentTrack.title}](${currentTrack.info?.uri || currentTrack.uri})\n\n**Queue:**\n${description}`;
  }

  const container = new ContainerBuilder()
    .setAccentColor(0xFF0000)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${config.emojis.queue} Queue`),
      new TextDisplayBuilder().setContent(description)
    );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Requested by ${interaction.user.tag}`)
  );

  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleNowPlayingCommand(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  const track = player.current || player.queue.current;
  if (!track) return interaction[replyMethod]({ content: 'Not playing anything!' });

  const container = new ContainerBuilder()
    .setAccentColor(0xFF0000);

  const thumbnail = track.info?.artworkUrl || track.thumbnail || track.artworkUrl;
  const trackTitle = track.info?.title || track.title || 'Unknown';
  const trackUri = track.info?.uri || track.uri || '#';
  const trackAuthor = track.info?.author || track.author || 'Unknown';
  const trackDuration = track.info?.length || track.length || track.duration || 0;

  if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
        new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
        new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL(thumbnail)
          .setDescription(trackTitle)
      );
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
      new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
      new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
    );
  }

  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleShuffleCommand(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  if (player.queue.size < 2) {
    return interaction[replyMethod]({ content: 'Need at least 2 songs in queue to shuffle!' });
  }

  const tracks = [];
  while (player.queue.size > 0) {
    tracks.push(player.queue.shift());
  }

  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }

  for (const track of tracks) {
    player.queue.add(track);
  }

  const container = createContainerWithFooter(`${config.emojis.shuffle} Shuffled the queue`, interaction.user);
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleLoopCommand(interaction, mode) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  switch (mode) {
    case 'off':
      player.setLoop('none');
      break;
    case 'track':
      player.setLoop('track');
      break;
    case 'queue':
      player.setLoop('queue');
      break;
    default:
      mode = 'track';
      player.setLoop('track');
  }

  const container = createContainerWithFooter(`${config.emojis.loop} Loop mode set to: ${mode}`, interaction.user);
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleRemoveCommand(interaction, position) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  const pos = position - 1;
  if (pos < 0 || pos >= player.queue.size) {
    return interaction[replyMethod]({ content: 'Invalid position!' });
  }

  const removed = player.queue[pos];
  player.queue.splice(pos, 1);
  const trackTitle = removed?.info?.title || removed?.title || 'Unknown';
  const trackUri = removed?.info?.uri || removed?.uri || '#';
  const container = createContainerWithFooter(`${config.emojis.error} Removed [${trackTitle}](${trackUri})`, interaction.user);
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleMoveCommand(interaction, from, to) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  const fromPos = from - 1;
  const toPos = to - 1;

  if (fromPos < 0 || fromPos >= player.queue.size || toPos < 0 || toPos >= player.queue.size) {
    return interaction[replyMethod]({ content: 'Invalid position!' });
  }

  const track = player.queue[fromPos];
  player.queue.splice(fromPos, 1);
  player.queue.splice(toPos, 0, track);

  const trackTitle = track?.info?.title || track?.title || 'Unknown';
  const trackUri = track?.info?.uri || track?.uri || '#';
  const container = createContainerWithFooter(`${config.emojis.position} Moved [${trackTitle}](${trackUri}) to position ${to}`, interaction.user);
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleClearQueueCommand(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  player.queue.length = 0;
  const container = createContainerWithFooter(`${config.emojis.error} Cleared the queue`, interaction.user);
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleStopCommand(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (player) {
    if (!player.data) player.data = new Map();
    player.data.set('manualStop', true);
    const container = createSimpleContainer(`${config.emojis.stop} Queue has ended!`);
    await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    player.destroy();
    await interaction[replyMethod]({ content: `${config.emojis.stop} Stopped the music and left` });
  } else {
    await interaction[replyMethod]({ content: 'Not playing anything!' });
  }
}

async function handleVolumeCommand(interaction, volume) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'Not playing anything!' });

  if (volume < 0 || volume > 100) {
    return interaction[replyMethod]({ content: 'Volume must be between 0 and 100!' });
  }

  player.setVolume(volume);
  await interaction[replyMethod]({ content: `${config.emojis.volume} Volume set to ${volume}%` });
}

async function handle247Command(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const player = riffy.players.get(interaction.guild.id);
  if (!player) return interaction[replyMethod]({ content: 'No music is playing!' });

  player.twentyFourSeven = !player.twentyFourSeven;
  const container = createContainerWithFooter(
    `${config.emojis.music} 24/7 mode is now ${player.twentyFourSeven ? 'enabled' : 'disabled'}`,
    interaction.user
  );
  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleHelpCommand(interaction) {
  // Use slash command format for slash commands, prefix for prefix commands
  const isSlashCommand = interaction.isCommand && interaction.isCommand();
  const cmdPrefix = isSlashCommand ? '/' : (config.enablePrefix ? config.prefix : '/');

  const container = new ContainerBuilder()
    .setAccentColor(0x9B59B6);

  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${config.emojis.music} ${client.user.username} - Premium Music Experience`),
      new TextDisplayBuilder().setContent('> **The most feature-rich Discord music bot**\n> High-quality audio • Lightning fast • 24/7 uptime')
    );

  const avatarURL = client.user.displayAvatarURL({ size: 256 });
  if (avatarURL && typeof avatarURL === 'string' && avatarURL.startsWith('http')) {
    try {
      headerSection.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarURL)
      );
    } catch (error) {
      console.log('Failed to add avatar thumbnail');
    }
  }

  container.addSectionComponents(headerSection);
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.play} Essential Controls`),
    new TextDisplayBuilder().setContent([
      `\`${cmdPrefix}play\` ${config.emojis.play} **Play** any song or playlist`,
      `\`${cmdPrefix}pause\` ${config.emojis.pause} **Pause** current track`,
      `\`${cmdPrefix}resume\` ${config.emojis.resume} **Resume** playback`,
      `\`${cmdPrefix}skip\` ${config.emojis.skip} **Skip** to next track`,
      `\`${cmdPrefix}stop\` ${config.emojis.stop} **Stop** and disconnect`,
      `\`${cmdPrefix}volume\` ${config.emojis.volume} **Volume** control (0-100)`
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.queue} Queue Management`),
    new TextDisplayBuilder().setContent([
      `\`${cmdPrefix}queue\` ${config.emojis.queue} **Display** current queue`,
      `\`${cmdPrefix}nowplaying\` ${config.emojis.nowplaying} **Current** track info`,
      `\`${cmdPrefix}shuffle\` ${config.emojis.shuffle} **Randomize** queue order`,
      `\`${cmdPrefix}loop\` ${config.emojis.loop} **Loop** modes (off/track/queue)`,
      `\`${cmdPrefix}remove\` ${config.emojis.error} **Remove** track by position`,
      `\`${cmdPrefix}move\` ${config.emojis.position} **Reorder** tracks in queue`,
      `\`${cmdPrefix}clearqueue\` ${config.emojis.error} **Clear** entire queue`
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.stats} Advanced Features`),
    new TextDisplayBuilder().setContent([
      `\`${cmdPrefix}247\` ${config.emojis.loop} **24/7** continuous mode`,
      `\`${cmdPrefix}stats\` ${config.emojis.stats} **Statistics** & performance`,
      `\`${cmdPrefix}ping\` ${config.emojis.ping} **Latency** check`,
      `\`${cmdPrefix}invite\` ${config.emojis.invite} **Add** bot to server`,
      `\`${cmdPrefix}support\` ${config.emojis.support} **Get** help & support`
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${config.emojis.servers} Serving ${client.guilds.cache.size} servers • Requested by ${interaction.user.tag}`)
  );

  const buttonRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Invite Bot')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
        .setEmoji(config.emojis.invite),
      new ButtonBuilder()
        .setLabel('Support Server')
        .setStyle(ButtonStyle.Link)
        .setURL(config.urls.support)
        .setEmoji(config.emojis.support),
      new ButtonBuilder()
        .setCustomId('refresh_help')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(config.emojis.loop)
    );

  container.addActionRowComponents(buttonRow);

  // Handle both slash commands and prefix commands
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ 
      components: [container], 
      flags: MessageFlags.IsComponentsV2 
    });
  } else {
    await interaction.reply({ 
      components: [container], 
      flags: MessageFlags.IsComponentsV2 
    });
  }
}

async function handleInviteCommand(interaction) {
  const container = new ContainerBuilder()
    .setAccentColor(0x00FF7F);

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${config.emojis.invite} Add Me to Your Server!`),
      new TextDisplayBuilder().setContent([
        '> **Transform your server into a premium music hub!**',
        '',
        `${config.emojis.music} **What you'll get:**`,
        '• High-quality music streaming',
        '• Advanced queue management',
        '• Interactive music controls',
        '• 24/7 music support',
        '• Lightning-fast responses'
      ].join('\n'))
    );

  const avatarURL = client.user.displayAvatarURL({ size: 256 });
  if (avatarURL && typeof avatarURL === 'string' && avatarURL.startsWith('http')) {
    try {
      section.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarURL)
      );
    } catch (error) {
      console.log('Failed to add avatar thumbnail');
    }
  }

  container.addSectionComponents(section);
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.warning} Required Permissions`),
    new TextDisplayBuilder().setContent([
      '• Connect & Speak in voice channels',
      '• Send messages & embeds',
      '• Use external emojis',
      '• Manage messages (for cleanup)'
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.success} Instant Setup`),
    new TextDisplayBuilder().setContent([
      '• Join a voice channel',
      '• Use `/play <song>`',
      '• Enjoy premium music!',
      '• Check `/help` for more'
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${config.emojis.servers} Already serving ${client.guilds.cache.size} servers • Requested by ${interaction.user.tag}`)
  );

  const buttonRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Invite Now')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
        .setEmoji(config.emojis.invite),
      new ButtonBuilder()
        .setLabel('Support')
        .setStyle(ButtonStyle.Link)
        .setURL(config.urls.support)
        .setEmoji(config.emojis.support)
    );

  container.addActionRowComponents(buttonRow);

  await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handlePingCommand(interaction) {
  const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  const start = Date.now();
  await interaction.deferReply();
  const end = Date.now();

  const apiLatency = end - start;
  const wsLatency = Math.round(client.ws.ping);

  let latencyColor = 0x00FF00;
  let latencyStatus = 'Excellent';

  if (wsLatency > 100) {
    latencyColor = 0xFFFF00;
    latencyStatus = 'Good';
  }
  if (wsLatency > 200) {
    latencyColor = 0xFF7F00;
    latencyStatus = 'Average';
  }
  if (wsLatency > 300) {
    latencyColor = 0xFF0000;
    latencyStatus = 'Poor';
  }

  const container = new ContainerBuilder()
    .setAccentColor(latencyColor);

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${config.emojis.ping} Connection Status`),
      new TextDisplayBuilder().setContent('> **Current network performance metrics**')
    );

  const avatarURL = client.user.displayAvatarURL({ size: 256 });
  if (avatarURL && typeof avatarURL === 'string' && avatarURL.startsWith('http')) {
    try {
      section.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarURL)
      );
    } catch (error) {
      console.log('Failed to add avatar thumbnail');
    }
  }

  container.addSectionComponents(section);
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${config.emojis.servers} **WebSocket Latency:** \`${wsLatency}ms\` • ${latencyStatus}`),
    new TextDisplayBuilder().setContent(`${config.emojis.stats} **API Response Time:** \`${apiLatency}ms\``),
    new TextDisplayBuilder().setContent(`${config.emojis.music} **Status:** ${wsLatency < 100 ? '🟢 Optimal' : wsLatency < 200 ? '🟡 Good' : wsLatency < 300 ? '🟠 Fair' : '🔴 Slow'}`)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.music} Music Quality`),
    new TextDisplayBuilder().setContent(wsLatency < 150 ? '**HD Audio** • No interruptions' : wsLatency < 250 ? '**Good Audio** • Minor delays possible' : '**Standard Audio** • Some buffering may occur')
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Requested by ${interaction.user.tag}`)
  );

  const buttonRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('refresh_help')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(config.emojis.loop)
    );

  container.addActionRowComponents(buttonRow);

  await interaction[replyMethod]({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleStatsCommand(interaction) {
  const uptime = Math.round(client.uptime / 1000);
  const seconds = uptime % 60;
  const minutes = Math.floor((uptime % 3600) / 60);
  const hours = Math.floor((uptime % 86400) / 3600);
  const days = Math.floor(uptime / 86400);

  const memoryUsage = process.memoryUsage();
  const totalMemory = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const usedMemory = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  const activePlayers = riffy.players.size;
  const playingPlayers = Array.from(riffy.players.values()).filter(p => p.playing).length;

  const container = new ContainerBuilder()
    .setAccentColor(0x7289DA);

  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${config.emojis.stats} Performance Dashboard`),
      new TextDisplayBuilder().setContent('> **Real-time bot performance metrics and analytics**')
    );

  const avatarURL = client.user.displayAvatarURL({ size: 256 });
  if (avatarURL && typeof avatarURL === 'string' && avatarURL.startsWith('http')) {
    try {
      headerSection.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarURL)
      );
    } catch (error) {
      console.log('Failed to add avatar thumbnail');
    }
  }

  container.addSectionComponents(headerSection);
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.user} Bot Information`),
    new TextDisplayBuilder().setContent([
      `**Name:** ${client.user.username}`,
      `**ID:** \`${client.user.id}\``,
      `**Version:** Discord.js v14`,
      `**Node.js:** ${process.version}`
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.uptime} Uptime & Performance`),
    new TextDisplayBuilder().setContent([
      `**Uptime:** ${days}d ${hours}h ${minutes}m ${seconds}s`,
      `**Latency:** ${Math.round(client.ws.ping)}ms`,
      `**Memory:** ${usedMemory}MB / ${totalMemory}MB`,
      `**CPU:** Node.js ${process.version}`
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.servers} Usage Statistics`),
    new TextDisplayBuilder().setContent([
      `**Servers:** ${client.guilds.cache.size.toLocaleString()}`,
      `**Users:** ${client.users.cache.size.toLocaleString()}`,
      `**Channels:** ${client.channels.cache.size.toLocaleString()}`,
      `**Commands:** ${config.enablePrefix ? 'Slash + Prefix' : 'Slash Only'}`
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.players} Music Analytics`),
    new TextDisplayBuilder().setContent([
      `**Total Players:** ${activePlayers}`,
      `**Currently Playing:** ${playingPlayers}`,
      `**Audio Engine:** Riffy`,
      `**Audio Quality:** High Definition`
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${config.emojis.stats} Statistics updated in real-time • Requested by ${interaction.user.tag}`)
  );

  const buttonRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('refresh_stats')
        .setLabel('Refresh Stats')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(config.emojis.loop)
    );

  container.addActionRowComponents(buttonRow);

  await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleSupportCommand(interaction) {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865F2);

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${config.emojis.support} Support Server`),
      new TextDisplayBuilder().setContent([
        '> **Need help? We\'re here for you!**',
        '',
        `${config.emojis.support} **Get Support:**`,
        '• Join our Discord server for instant help',
        '• Report bugs and suggest features',
        '• Get updates and announcements',
        '• Connect with other users',
        '',
        '**Our support team is ready to assist you 24/7!**'
      ].join('\n'))
    );

  const avatarURL = client.user.displayAvatarURL({ size: 256 });
  if (avatarURL && typeof avatarURL === 'string' && avatarURL.startsWith('http')) {
    try {
      section.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(avatarURL)
      );
    } catch (error) {
      console.log('Failed to add avatar thumbnail');
    }
  }

  container.addSectionComponents(section);
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${config.emojis.success} Quick Links`),
    new TextDisplayBuilder().setContent([
      '• [Join Support Server](' + config.urls.support + ')',
      '• [View Documentation](' + config.urls.github + ')',
      '• [Report Issues](' + config.urls.github + '/issues)',
      '• [Feature Requests](' + config.urls.github + '/issues/new)'
    ].join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${config.emojis.servers} Serving ${client.guilds.cache.size} servers • Requested by ${interaction.user.tag}`)
  );

  const buttonRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Join Support Server')
        .setStyle(ButtonStyle.Link)
        .setURL(config.urls.support)
        .setEmoji(config.emojis.support),
      new ButtonBuilder()
        .setLabel('Documentation')
        .setStyle(ButtonStyle.Link)
        .setURL(config.urls.github)
        .setEmoji(config.emojis.stats)
    );

  container.addActionRowComponents(buttonRow);

  await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// Handle raw Discord events for voice state updates (required by Riffy)
client.on('raw', (packet) => {
  riffy.updateVoiceState(packet);
});

if (config.enablePrefix) {
  client.on('messageCreate', handlePrefixCommand);
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isCommand() && !interaction.isButton() && !interaction.isStringSelectMenu()) return;

    if (interaction.isButton()) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ flags: 64 });
      }

      if (!interaction.member.voice.channel) {
        return interaction.editReply({ content: 'You need to join a voice channel to use the buttons!' });
      }
      const player = riffy.players.get(interaction.guild.id);
      if (!player) return interaction.editReply({ content: 'No player found!' });

      const currentTrack = player.current || player.queue.current;
      if (!currentTrack) return interaction.editReply({ content: 'No track is currently playing!' });

      // Ensure player.data is always a Map
      if (!player.data || !(player.data instanceof Map)) {
        player.data = new Map();
      }

      switch (interaction.customId) {
        case 'pause_resume':
          player.pause(!player.paused);

          // Update the button to reflect new state
          const updatedContainer = new ContainerBuilder()
            .setAccentColor(0xFF0000);

          const thumbnail = currentTrack.info?.artworkUrl || currentTrack.thumbnail || currentTrack.artworkUrl;
          const trackTitle = currentTrack.info?.title || currentTrack.title || 'Unknown';
          const trackUri = currentTrack.info?.uri || currentTrack.uri || '#';
          const trackAuthor = currentTrack.info?.author || currentTrack.author || 'Unknown';
          const trackDuration = currentTrack.info?.length || currentTrack.length || currentTrack.duration || 0;

          if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
            const section = new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
                new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
                new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
              )
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
            updatedContainer.addSectionComponents(section);
          } else {
            updatedContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
              new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
              new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
            );
          }

          const updatedButtonRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('pause_resume')
                .setLabel(player.paused ? '▶️' : '⏸️')
                .setStyle(player.paused ? ButtonStyle.Success : ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('skip')
                .setLabel('⏭️')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('stop')
                .setLabel('⏹️')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId('loop')
                .setLabel('🔄')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('queue')
                .setLabel('📜')
                .setStyle(ButtonStyle.Secondary)
            );

          updatedContainer.addActionRowComponents(updatedButtonRow);

          await interaction.message.edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
          await interaction.editReply({ content: player.paused ? `${config.emojis.pause} Paused` : `${config.emojis.resume} Resumed` });
          break;
        case 'skip':
          // Disable buttons
          const disabledSkipRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('pause_resume')
                .setLabel('⏸️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('skip')
                .setLabel('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('stop')
                .setLabel('⏹️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('loop')
                .setLabel('🔄')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('queue')
                .setLabel('📜')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            );

          const disabledContainerSkip = new ContainerBuilder()
            .setAccentColor(0xFF0000);

          const skipThumbnail = currentTrack.info?.artworkUrl || currentTrack.thumbnail || currentTrack.artworkUrl;
          const skipTitle = currentTrack.info?.title || currentTrack.title || 'Unknown';
          const skipUri = currentTrack.info?.uri || currentTrack.uri || '#';
          const skipAuthor = currentTrack.info?.author || currentTrack.author || 'Unknown';
          const skipDuration = currentTrack.info?.length || currentTrack.length || currentTrack.duration || 0;

          if (skipThumbnail && typeof skipThumbnail === 'string' && skipThumbnail.startsWith('http')) {
            const section = new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
                new TextDisplayBuilder().setContent(`**[${skipTitle}](${skipUri})**`),
                new TextDisplayBuilder().setContent(`${config.emojis.user} ${skipAuthor} • ${config.emojis.duration} ${formatDuration(skipDuration)}`)
              )
              .setThumbnailAccessory(
                thumb => thumb
                  .setURL(skipThumbnail)
                  .setDescription(skipTitle)
              );
            disabledContainerSkip.addSectionComponents(section);
          } else {
            disabledContainerSkip.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
              new TextDisplayBuilder().setContent(`**[${skipTitle}](${skipUri})**`),
              new TextDisplayBuilder().setContent(`${config.emojis.user} ${skipAuthor} • ${config.emojis.duration} ${formatDuration(skipDuration)}`)
            );
          }

          disabledContainerSkip.addActionRowComponents(disabledSkipRow);
          await interaction.message.edit({ components: [disabledContainerSkip], flags: MessageFlags.IsComponentsV2 }).catch(console.error);

          if (player.queue.size === 0) {
            const container = createSimpleContainer(`${config.emojis.music} Queue has ended!`);
            await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            player.data.set('manualStop', true);
          }
          player.stop();
          await interaction.editReply({ content: `${config.emojis.skip} Skipped` });
          break;
        case 'stop':
          // Disable buttons
          const disabledStopRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('pause_resume')
                .setLabel('⏸️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('skip')
                .setLabel('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('stop')
                .setLabel('⏹️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('loop')
                .setLabel('🔄')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('queue')
                .setLabel('📜')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            );

          const disabledStopContainer = new ContainerBuilder()
            .setAccentColor(0xFF0000);

          const stopThumbnail = currentTrack.info?.artworkUrl || currentTrack.thumbnail || currentTrack.artworkUrl;
          const stopTitle = currentTrack.info?.title || currentTrack.title || 'Unknown';
          const stopUri = currentTrack.info?.uri || currentTrack.uri || '#';
          const stopAuthor = currentTrack.info?.author || currentTrack.author || 'Unknown';
          const stopDuration = currentTrack.info?.length || currentTrack.length || currentTrack.duration || 0;

          if (stopThumbnail && typeof stopThumbnail === 'string' && stopThumbnail.startsWith('http')) {
            const section = new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
                new TextDisplayBuilder().setContent(`**[${stopTitle}](${stopUri})**`),
                new TextDisplayBuilder().setContent(`${config.emojis.user} ${stopAuthor} • ${config.emojis.duration} ${formatDuration(stopDuration)}`)
              )
              .setThumbnailAccessory(
                thumb => thumb
                  .setURL(stopThumbnail)
                  .setDescription(stopTitle)
              );
            disabledStopContainer.addSectionComponents(section);
          } else {
            disabledStopContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
              new TextDisplayBuilder().setContent(`**[${stopTitle}](${stopUri})**`),
              new TextDisplayBuilder().setContent(`${config.emojis.user} ${stopAuthor} • ${config.emojis.duration} ${formatDuration(stopDuration)}`)
            );
          }

          disabledStopContainer.addActionRowComponents(disabledStopRow);
          await interaction.message.edit({ components: [disabledStopContainer], flags: MessageFlags.IsComponentsV2 }).catch(console.error);

          player.data.set('manualStop', true);
          const container = createSimpleContainer(`${config.emojis.stop} Queue has ended!`);
          await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
          player.destroy();
          await interaction.editReply({ content: `${config.emojis.stop} Stopped` });
          break;
        case 'loop':
          const currentLoop = player.loop || 'none';
          const newLoop = currentLoop === 'none' ? 'track' : 'none';
          player.setLoop(newLoop);
          await interaction.editReply({ content: `${config.emojis.loop} Loop: ${newLoop === 'none' ? 'Disabled' : 'Enabled'}` });
          break;
        case 'queue':
          const queue = player.queue;
          const currentTrack2 = player.current || player.queue.current;
          const maxDisplay = 10;
          let queueList = queue.size > 0 
            ? queue.slice(0, maxDisplay).map((track, i) =>
                `${i + 1}. [${track.info?.title || track.title}](${track.info?.uri || track.uri})`).join('\n')
            : 'No songs in queue';

          if (queue.size > maxDisplay) {
            queueList += `\n\n*...and ${queue.size - maxDisplay} more tracks*`;
          }

          let description = currentTrack2 
            ? `**Now Playing:**\n[${currentTrack2.info?.title || currentTrack2.title}](${currentTrack2.info?.uri || currentTrack2.uri})\n\n**Queue:**\n${queueList}`
            : queueList;

          const queueContainer = new ContainerBuilder()
            .setAccentColor(0xFF0000)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${config.emojis.queue} Queue`),
              new TextDisplayBuilder().setContent(description)
            );
          await interaction.editReply({ components: [queueContainer], flags: MessageFlags.IsComponentsV2 });
          break;
      }
      return;
    }

    if (interaction.isButton() && (interaction.customId === 'refresh_help' || interaction.customId === 'refresh_stats')) {
      if (interaction.customId === 'refresh_help') {
        await handleHelpCommand(interaction);
        return;
      } else if (interaction.customId === 'refresh_stats') {
        await handleStatsCommand(interaction);
        return;
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'filter') {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ flags: 64 });
      }

      const player = riffy.players.get(interaction.guild.id);
      if (!player) return interaction.editReply({ content: 'No player found!' });

      const filter = interaction.values[0];
      player.setFilters({
        [filter]: true
      });

      const container = createContainerWithFooter(`${config.emojis.music} Applied filter: ${filter}`, interaction.user);
      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    if (!interaction.isCommand()) return;

    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply();
    }

    const { commandName, options } = interaction;

    switch (commandName) {
      case 'play':
        await handlePlayCommand(interaction, options.getString('query'));
        break;
      case 'pause':
        await handlePauseCommand(interaction);
        break;
      case 'resume':
        await handleResumeCommand(interaction);
        break;
      case 'skip':
        await handleSkipCommand(interaction);
        break;
      case 'queue':
        await handleQueueCommand(interaction);
        break;
      case 'nowplaying':
        await handleNowPlayingCommand(interaction);
        break;
      case 'shuffle':
        await handleShuffleCommand(interaction);
        break;
      case 'loop':
        await handleLoopCommand(interaction, options.getString('mode'));
        break;
      case 'remove':
        await handleRemoveCommand(interaction, options.getInteger('position'));
        break;
      case 'move':
        await handleMoveCommand(interaction, options.getInteger('from'), options.getInteger('to'));
        break;
      case 'clearqueue':
        await handleClearQueueCommand(interaction);
        break;
      case 'stop':
        await handleStopCommand(interaction);
        break;
      case 'volume':
        await handleVolumeCommand(interaction, options.getInteger('level'));
        break;
      case '247':
        await handle247Command(interaction);
        break;
      case 'help':
        await handleHelpCommand(interaction);
        break;
      case 'invite':
        await handleInviteCommand(interaction);
        break;
      case 'ping':
        await handlePingCommand(interaction);
        break;
      case 'stats':
        await handleStatsCommand(interaction);
        break;
      case 'support':
        await handleSupportCommand(interaction);
        break;
      default:
        await interaction.editReply({ content: 'Unknown command!' });
        break;
    }
  } catch (error) {
    console.error('Interaction error:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An error occurred while processing your command!', ephemeral: true });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: 'An error occurred while processing your command!' });
      }
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

riffy.on('nodeConnect', (node) => {
  console.log(`✅ Main node "${node.name || 'main'}" connected successfully`);
});

riffy.on('nodeError', (node, error) => {
  console.error(`❌ Main node "${node.name || 'main'}" error:`, error.message || error);
});

riffy.on('nodeDisconnect', (node) => {
  console.log(`⚠️ Main node "${node.name || 'main'}" disconnected`);
});

riffy.on('playerStart', (player, track) => {
  try {
    // Ensure player.data is always a Map
    if (!player.data || !(player.data instanceof Map)) {
      player.data = new Map();
    }

    const channel = client.channels.cache.get(player.textChannel);
    if (channel) {
      const container = new ContainerBuilder()
        .setAccentColor(0xFF0000);

      const thumbnail = track.info?.artworkUrl || track.thumbnail || track.artworkUrl;
      const trackTitle = track.info?.title || track.title || 'Unknown';
      const trackUri = track.info?.uri || track.uri || '#';
      const trackAuthor = track.info?.author || track.author || 'Unknown';
      const trackDuration = track.info?.length || track.length || track.duration || 0;

      if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
            new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
            new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
          new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
          new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
        );
      }

      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('pause_resume')
            .setLabel('⏸️')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('skip')
            .setLabel('⏭️')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('stop')
            .setLabel('⏹️')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('loop')
            .setLabel('🔄')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('queue')
            .setLabel('📜')
            .setStyle(ButtonStyle.Secondary)
        );

      container.addActionRowComponents(buttonRow);

      channel.send({ 
        components: [container], 
        flags: MessageFlags.IsComponentsV2 
      }).then(msg => {
        player.data.set('currentMessage', msg);
      }).catch(error => {
        console.error('Failed to send now playing message:', error);
        // Fallback to simple message if container fails
        channel.send(`${config.emojis.nowplaying} Now playing: **${track.info?.title || track.title}**`).catch(console.error);
      });
    }
  } catch (error) {
    console.error('Error in playerStart event:', error);
  }
});

riffy.on('trackEnd', async (player) => {
  try {
    // Ensure player.data is always a Map
    if (!player.data || !(player.data instanceof Map)) {
      player.data = new Map();
    }

    if (player.data.get('manualStop')) {
      player.data.delete('manualStop');
      return;
    }

    if (player.queue.size > 0) {
      await player.play();
    } else if (!player.twentyFourSeven) {
      // Disable buttons on the current message
      const currentMessage = player.data.get('currentMessage');
      if (currentMessage) {
        const disabledRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('pause_resume')
              .setLabel('⏸️')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('skip')
              .setLabel('⏭️')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('stop')
              .setLabel('⏹️')
              .setStyle(ButtonStyle.Danger)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('loop')
              .setLabel('🔄')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('queue')
              .setLabel('📜')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

        const currentTrack = player.current || player.queue.current;
        if (currentTrack) {
          const disabledContainer = new ContainerBuilder()
            .setAccentColor(0xFF0000);

          const thumbnail = currentTrack.info?.artworkUrl || currentTrack.thumbnail || currentTrack.artworkUrl;
          const trackTitle = currentTrack.info?.title || currentTrack.title || 'Unknown';
          const trackUri = currentTrack.info?.uri || currentTrack.uri || '#';
          const trackAuthor = currentTrack.info?.author || currentTrack.author || 'Unknown';
          const trackDuration = currentTrack.info?.length || currentTrack.length || currentTrack.duration || 0;

          if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
            const section = new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
                new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
                new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
              )
              .setThumbnailAccessory(
                new ThumbnailBuilder()
                  .setURL(thumbnail)
                  .setDescription(trackTitle)
              );
            disabledContainer.addSectionComponents(section);
          } else {
            disabledContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
              new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
              new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
            );
          }

          disabledContainer.addActionRowComponents(disabledRow);
          await currentMessage.edit({ components: [disabledContainer], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
        }
      }

      const channel = client.channels.cache.get(player.textChannel);
      if (channel) {
        const container = createSimpleContainer(`${config.emojis.music} Queue has ended!`);
        channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(error => {
          console.error('Failed to send queue ended message:', error);
        });
      }
      player.destroy();
    }
  } catch (error) {
    console.error('Error in trackEnd event:', error);
  }
});

riffy.on('queueEnd', async (player) => {
  try {
    // Ensure player.data is always a Map
    if (!player.data || !(player.data instanceof Map)) {
      player.data = new Map();
    }

    if (player.data.get('manualStop')) {
      player.data.delete('manualStop');
      return;
    }

    if (!player.twentyFourSeven) {
      // Disable buttons on the current message
      const currentMessage = player.data.get('currentMessage');
      if (currentMessage) {
        const disabledRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('pause_resume')
              .setLabel('⏸️')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('skip')
              .setLabel('⏭️')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('stop')
              .setLabel('⏹️')
              .setStyle(ButtonStyle.Danger)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('loop')
              .setLabel('🔄')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('queue')
              .setLabel('📜')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

        const currentTrack = player.current || player.queue.current;
        if (currentTrack) {
          const disabledContainer = new ContainerBuilder()
            .setAccentColor(0xFF0000);

          const thumbnail = currentTrack.info?.artworkUrl || currentTrack.thumbnail || currentTrack.artworkUrl;
          const trackTitle = currentTrack.info?.title || currentTrack.title || 'Unknown';
          const trackUri = currentTrack.info?.uri || currentTrack.uri || '#';
          const trackAuthor = currentTrack.info?.author || currentTrack.author || 'Unknown';
          const trackDuration = currentTrack.info?.length || currentTrack.length || currentTrack.duration || 0;

          if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
            const section = new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
                new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
                new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
              )
              .setThumbnailAccessory(
                new ThumbnailBuilder()
                  .setURL(thumbnail)
                  .setDescription(trackTitle)
              );
            disabledContainer.addSectionComponents(section);
          } else {
            disabledContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${config.emojis.nowplaying} Now Playing`),
              new TextDisplayBuilder().setContent(`**[${trackTitle}](${trackUri})**`),
              new TextDisplayBuilder().setContent(`${config.emojis.user} ${trackAuthor} • ${config.emojis.duration} ${formatDuration(trackDuration)}`)
            );
          }

          disabledContainer.addActionRowComponents(disabledRow);
          await currentMessage.edit({ components: [disabledContainer], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
        }
      }

      const channel = client.channels.cache.get(player.textChannel);
      if (channel) {
        const container = createSimpleContainer(`${config.emojis.music} Queue has ended!`);
        channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(error => {
          console.error('Failed to send queue ended message:', error);
        });
      }
      player.destroy();
    }
  } catch (error) {
    console.error('Error in queueEnd event:', error);
  }
});

riffy.on('playerError', (player, error) => {
  console.error('Player error:', error);

  try {
    const channel = client.channels.cache.get(player.textChannel);
    if (channel) {
      const container = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${config.emojis.error} Playback Error`),
          new TextDisplayBuilder().setContent('An error occurred during playback. Skipping to the next track...')
        );

      channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);

      if (player.queue.size > 0) {
        player.skip();
      } else {
        player.destroy();
      }
    }
  } catch (err) {
    console.error('Error handling player error:', err);
  }
});

riffy.on('playerException', (player, exception) => {
  console.error('Player exception:', exception);

  try {
    const channel = client.channels.cache.get(player.textChannel);
    if (channel) {
      const container = new ContainerBuilder()
        .setAccentColor(0xFFA500)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${config.emojis.warning} Playback Exception`),
          new TextDisplayBuilder().setContent('A playback exception occurred. The track may be unavailable or corrupted.')
        );

      channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
    }
  } catch (err) {
    console.error('Error handling player exception:', err);
  }
});

riffy.on('playerResolveError', (player, track, message) => {
  console.error('Player resolve error:', message);

  try {
    const channel = client.channels.cache.get(player.textChannel);
    if (channel) {
      const container = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${config.emojis.error} Track Resolution Error`),
          new TextDisplayBuilder().setContent(`Failed to resolve track: **${track.info?.title || track.title}**\nReason: ${message}`)
        );

      channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
    }
  } catch (err) {
    console.error('Error handling resolve error:', err);
  }
});

riffy.on('playerDestroy', async (player) => {
  console.log(`Player destroyed for guild: ${player.guildId}`);
  // Cleanup is handled automatically with Components V2
});

client.login(config.token);
