// npm install googleapis@105 @google-cloud/local-auth@2.1.0 --save

const fs = require('fs');
const fsp = fs.promises;

const { exec, spawn } = require("child_process");
const { stderr, stdout } = require('process');


const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();
const EventEmitter = require("events");
const { file } = require('googleapis/build/src/apis/file');
const eventEmitter = new EventEmitter();
const hr = require("@tsmx/human-readable");
const shell = require("shelljs");
const filehound = require("filehound");

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];
// File id of the file to download
let FILEID;
let fileName;
let fileSize;


// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = 'credentials.json';

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fsp.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    const content = await fsp.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fsp.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}


/**
 * Download file
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function downloadFile(authClient) {

    const service = google.drive({version: 'v3', auth: authClient});

    fileId = FILEID;
    try {

        // get the file name
        const fileMetaData = await service.files.get({
                fileId: fileId, fields: 'name, size'
            },
        );

        // create stream writer with the file name from drive
        const fileStream = fs.createWriteStream(fileMetaData.data.name)
        console.log('downloading: ' + fileMetaData.data.name);

        fileName = fileMetaData.data.name;
        fileSize = fileMetaData.data.size;

        const file = await service.files.get({
            fileId: fileId,
            alt: 'media',
        }, {
                responseType: "stream"
            }
        );

        eventEmitter.emit("downloading", fileName, fileSize);

        file.data.on('end', () => eventEmitter.emit("downloaded", fileName));
        file.data.pipe(fileStream);

    } catch (err) {
        // TODO(developer) - Handle error
        console.error(err);
        throw err;
    }
}

// authorize().then(downloadFile).catch(console.error);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages] });

eventEmitter.on("start", () => {
    console.log("Event emitter started.");
})
eventEmitter.emit("start");

const token = process.env.DISCORD_TOKEN;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === '=ping') {
        await message.reply('Pong!');
    }

    if (command === "=download") {
        const fileSearchResults = await filehound.create()
            .ext("mp4")
            .find();

        if (fileSearchResults.length > 0) return message.reply("Another Download is currently running at the moment. Please wait for that download to finish, then try again.");

        if (args.length === 0) {
            await message.reply("Please provide a download link.");
            return;
        }
        if (args[1]) {
            await message.reply("Invalid usage. `=download <link>`");
            return;
        }
        
        let downloadLink = args[0];
        let currentFileSize;
        let downloadComplete;
        if(!downloadLink.startsWith("https://drive.google.com/file/d/")) return message.reply("Only Google Drive links are supported.");
        FILEID = downloadLink.slice(32).split("/")[0];

        let dlmessage = await message.reply(`Downloading... \nThis may take awhile, at the moment, there is no progress bar.`);
        authorize().then(downloadFile).catch((error) => {
            console.log(`[err] ${error}`);
            removeFiles();
            return message.reply("A timeout error occured while the file was downloading. <@208779984276291585> check the logs.");
        });

        eventEmitter.on("downloading", (fileName, fileSize) => {
            dlmessage.edit(`Downloading **${fileName}** \nFile Size: **${hr.fromBytes(fileSize)}**`);
            currentFileSize = fs.statSync(`${fileName}`).size;
            function checkProgress() {
                setTimeout(() => {
                    if (currentFileSize<fileSize) {
                        dlmessage.edit(`Downloading **${fileName}** \nProgress: **${hr.fromBytes(currentFileSize)} / ${hr.fromBytes(fileSize)}**`);
                        currentFileSize = fs.statSync(`${fileName}`).size;
                        checkProgress();
                    }
                }, 3000)
            }
            checkProgress();
        });

        function sendToDiscord() {
            setTimeout(() => {
                message.reply({
                    files: [`${fileName.slice(0, -4)}.txt`, `${fileName.slice(0, -4)}-mediainfo.txt`]
                });
                removeFiles();
            }, 1000);
        }

        function removeFiles() {
            setTimeout(() => {
                if(fs.existsSync(`${fileName}`)) fs.unlinkSync(`${fileName}`);
                if(fs.existsSync(`${fileName.slice(0, -4)}.txt`)) fs.unlinkSync(`${fileName.slice(0, -4)}.txt`);
                if(fs.existsSync(`${fileName.slice(0, -4)}-mediainfo.txt`)) fs.unlinkSync(`${fileName.slice(0, -4)}-mediainfo.txt`);
                message.channel.send("Files Removed from server! You may start another download.");
            }, 2000);
        }

        eventEmitter.on("downloaded", fileName => {
            setTimeout(() => {
                dlmessage.edit(`Downloaded ${fileName}! \nRunning exiftool and mediainfo...`);
                downloadComplete = "yes";
            }, 3500)
        });

        function checkDownloaded() {
            setTimeout(() => {
                if (downloadComplete !== "yes") {
                    checkDownloaded();
                } else {
                    shell.exec(`exiftool -api largefilesupport=true -w txt "${fileName}"`);
                    shell.exec(`mediainfo --LogFile="${fileName.slice(0, -4)}-mediainfo.txt" "${fileName}"`);
                    sendToDiscord();
                }
            }, 15000)
        }

        checkDownloaded();
    }
});

client.login(token);
