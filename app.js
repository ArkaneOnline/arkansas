const { Client, GatewayIntentBits } = require('discord.js');
const fs = require("fs");
const { exec } = require("child_process");
const { stderr, stdout } = require('process');
const easydl = require("easydl");
const { error } = require('console');
const humanReadable = require("@tsmx/human-readable");
require("dotenv").config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages] });

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
        if (fs.existsSync("video.mp4.$$0$PART")) return message.reply("Another Download is currently happening, please wait for that one to finish first!");
        if (args.length === 0) {
            await message.reply("Please provide a download link.");
            return;
        }
        if (args[1]) {
            await message.reply("Invalid usage. `=download <link>`");
            return;
        }
        
        let downloadLink = args[0];
        if(!downloadLink.startsWith("https://drive.google.com/file/d/")) return message.reply("Only Google Drive links are supported.");
        let fileID = downloadLink.slice(32).split("/")[0];
        downloadLink = `https://www.googleapis.com/drive/v3/files/${fileID}?alt=media&key=${process.env.GOOGLE_API_KEY}`

        let dlmessage = await message.reply("Downloading... (if this doesn't change within 10 seconds, chances are there is an error. Ping Arkane so he can fix it.");

        new easydl(downloadLink, "./video.mp4", {
            connections: 1
        })
            .on("metadata", (metadata) => {
                dlmessage.edit(`Downloading... \nFile Size: ${humanReadable.fromBytes(metadata.size)}`);
            })
            .on("progress", ({ details, total }) => {
                dlmessage.edit(`Downloading... \nCurrent Progress: **${total.percentage.toString().split(".")[0]}%** \nDownload Speed: **${humanReadable.fromBytes(total.speed)}/s**`);
            })
            .on("error", (err) => {
                if(fs.existsSync("video.mp4.$$0$PART")) fs.unlinkSync("video.mp4.$$0$PART");
                console.error("[error]", err);
                if(err.toString().startsWith("Error: Got HTTP Response code 403")) return message.reply("A 403 error occured when downloading this file. This is usually caused by a rate limit. Please try again later.");
                if(err.toString().startsWith("Error: Got HTTP Response code 404")) return message.reply("A 404 error occured when downloading this file. This is usually caused by either a missing file, or a private file.");
                return message.reply("An unknown error occured, please try again.");
            })
            .wait()
            .then(async (completed) => {
                console.log("File Downloaded!");
                dlmessage.edit(`Downloaded!`);
                const fileName = "video.mp4";
                exec(`exiftool -api largefilesupport=true -w txt ${fileName}`, (error, stderr, stdout) => {
                    if(error) {
                        console.error(error.message);
                        return;
                    }
                    if(stderr) {
                        console.error(stderr);
                        return;
                    }
                });
                exec(`mediainfo --LogFile="video-mediainfo.txt" ${fileName}`, (error, stderr, stdout) => {
                    if(error) {
                        console.error(error.message);
                        return;
                    }
                    if(stderr) {
                        console.error(stderr);
                        return;
                    }
                });

                setTimeout(() => {
                    message.reply({
                        files: ["video.txt", "video-mediainfo.txt"]
                    });
                }, 1000);

                setTimeout(() => {
                    fs.unlinkSync("video.txt");
                    fs.unlinkSync("video-mediainfo.txt");
                    fs.unlinkSync("video.mp4");
                    message.channel.send("Files Removed from server! You may start another download.");
                }, 3000);
            })
            .catch((err) => {
                console.error(err);
            });
    }
});

client.login(token);