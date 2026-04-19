require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { startTrackingScheduler } = require('./services/trackingScheduler');

const LOCK_FILE = path.join(__dirname, 'data', 'bot.lock');

function acquireSingleInstanceLock() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });

  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') {
      const existingPid = fs.readFileSync(LOCK_FILE, 'utf8').trim() || 'unknown';
      console.error(`Another bot instance is already running (PID: ${existingPid}).`);
      process.exit(1);
    }

    throw error;
  }
}

function releaseSingleInstanceLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const storedPid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      if (storedPid === String(process.pid)) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (error) {
    console.error('Failed to release bot lock:', error.message);
  }
}

acquireSingleInstanceLock();

process.on('exit', releaseSingleInstanceLock);
process.on('SIGINT', () => {
  releaseSingleInstanceLock();
  process.exit(0);
});
process.on('SIGTERM', () => {
  releaseSingleInstanceLock();
  process.exit(0);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[WARN] The command at ${filePath} is missing required properties.`);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag} (PID: ${process.pid})`);
  try {
    const cmds = client.commands.map((cmd) => cmd.data.toJSON());
    await client.application.commands.set(cmds);
    console.log('Slash commands registered globally.');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }

  startTrackingScheduler();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await interaction.deferReply();
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    console.error('[interaction-error]', {
      command: interaction.commandName,
      deferred: interaction.deferred,
      replied: interaction.replied,
    });

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Oops! Something went wrong while executing this command.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Oops! Something went wrong while executing this command.', ephemeral: true });
      }
    } catch (replyError) {
      console.error('[interaction-error:reply-failed]', replyError);
    }
  }
});

client.on('error', (error) => {
  console.error('[client-error]', error);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
